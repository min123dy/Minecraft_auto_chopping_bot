// manager.js
const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");
const config = require("./config");

const runningProcesses = [];

// 🤖 개별 봇 파일에 주입될 독립형 소스코드 템플릿 스트링
function generateBotTemplate(botName, botIndex) {
    return `const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const GoalLookAtBlock = goals.GoalLookAtBlock;
const config = require("./config");

const privateApi = {
    endpoint: "https://api.custom-service.com/v1/bots/${botName}",
    token: "secret_token_key_${botName}",
    id: ${botIndex}
};

const bot = mineflayer.createBot({
    host: config.SERVER_HOST,
    port: config.SERVER_PORT,
    username: "${botName}",
    version: config.MINECRAFT_VERSION,
    connectTimeout: 8000,
    viewDistance: "tiny"
});

process.on("uncaughtException", (err) => {
    console.error(\`[\${bot.username}] Uncaught Exception\`);
    console.error(err);
});

process.on("unhandledRejection", (err) => {
    console.error(\`[\${bot.username}] Unhandled Rejection\`);
    console.error(err);
});

bot.loadPlugin(pathfinder);

// 🦘 [강제 점프 시스템] 다른 모든 동작/컨트롤과 무관하게 특정 주기마다 무조건 점프 시도
setInterval(() => {
    // 봇이 존재하고, 땅에 딛고 있을 때만 점프 수행 (공중 부양 방지)
    if (!bot.entity || !bot.entity.onGround) return;
    
    let tickCount = 0;
    const forceJumpListener = () => {
        bot.setControlState("jump", true);
        tickCount++;
        
        // 2틱(약 0.1초) 동안 강제로 누른 뒤 해제 (서버 패킷에 완벽히 인지되도록 보장)
        if (tickCount >= 2) {
            bot.removeListener("physicsTick", forceJumpListener);
        }
    };
    
    // 패스파인더 플러그인이 로드된 후에 등록되므로, 패스파인더 신호를 뒤에서 무조건 덮어씁니다.
    bot.on("physicsTick", forceJumpListener);
}, 4000); // ⏱️ 4000ms = 4초 주기 (원하는 초 단위 주기로 이 숫자를 변경하시면 됩니다)


let isMiningActive = false;
let isBusy = false;
let currentTargetBlock = null;
let currentBlockNames = [];
const unreachableBlocks = new Set();

process.on("message", (command) => {
    if (command === "stop") {
        stopEverything();
    } else if (command === "mine_logs") {
        startMiningLoop(config.ALL_LOGS);
    } else if (command === "mine_stones") {
        startMiningLoop(config.STONES);
    }
});

function startMiningLoop(blockNames) {
    if (isMiningActive) return;
    isMiningActive = true;

    const defaultMove = new Movements(bot);
    defaultMove.canDig = true;
    defaultMove.canPlaceOn = true;
    defaultMove.scaffoldingBlocks = ['dirt', 'cobblestone', 'stone'];
    
    // 🐢 [속도 제어] 달리기를 원천 차단하고 오직 걷기만 수행
    defaultMove.allowSprinting = false; 
    
    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.thinkTimeout = 1000;
    bot.pathfinder.maxPathCount = 2000;

    // 🐢 [속도 제어] 물리 엔진의 기본 걷기 속도(0.1)를 0.06으로 하향하여 일반 플레이어보다 느리게 이동
    bot.physics.walkingSpeed = 0.06;

    currentBlockNames = blockNames;
    runMiningTask();
}

async function runMiningTask() {
    if (!isMiningActive || isBusy) return;
    isBusy = true;

    try {
        if (!currentTargetBlock || currentTargetBlock.type === 0 || unreachableBlocks.has(currentTargetBlock.position.toString())) {
            const targetIds = currentBlockNames.map(name => bot.registry.blocksByName[name]?.id).filter(Boolean);
            const matchingBlocks = bot.findBlocks({ matching: targetIds, maxDistance: 32, count: 40 });

            if (matchingBlocks.length > 0) {
                let startIndex = privateApi.id % matchingBlocks.length;
                let selectedBlock = null;

                for (let i = 0; i < matchingBlocks.length; i++) {
                    const checkIndex = (startIndex + i) % matchingBlocks.length;
                    const pos = matchingBlocks[checkIndex];
                    
                    if (!unreachableBlocks.has(pos.toString())) {
                        selectedBlock = bot.blockAt(pos);
                        break;
                    }
                }
                currentTargetBlock = selectedBlock;
            }
        }

        if (!currentTargetBlock) {
            unreachableBlocks.clear();
            // 주변에 블록이 없을 때 다시 탐색할 때까지의 대기 시간 (1.5초)
            setTimeout(() => { isBusy = false; runMiningTask(); }, 1500);
            return;
        }

        const distance = bot.entity.position.distanceTo(currentTargetBlock.position);

        async function gotoWithTimeout(goal, ms = 5000) {
            return Promise.race([
                bot.pathfinder.goto(goal),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Goto timeout")), ms)
                )
            ]);
        }

        if (distance > 4.2) {
            const goal = new GoalLookAtBlock(currentTargetBlock.position, bot.world);
            await gotoWithTimeout(goal);
            isBusy = false;
            
            // 목적지 도달 후 행동 개시 전 숨 고르기 대기 시간 (1초)
            setTimeout(() => runMiningTask(), 1000);
        } else {
            if (bot.game.gameMode === "survival") {
                const tool = bot.pathfinder.bestHarvestTool(currentTargetBlock);
                if (tool) await bot.equip(tool, "hand");
            }
            
            async function lookWithTimeout(pos, ms = 3000) {
                return Promise.race([
                    bot.lookAt(pos),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Look timeout")), ms)
                    )
                ]);
            }

            await lookWithTimeout(currentTargetBlock.position.offset(0.5, 0.5, 0.5));

            async function digWithTimeout(block, ms = 5000) {
                return Promise.race([
                    bot.dig(block, true),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Dig timeout")), ms)
                    )
                ]);
            }
            await digWithTimeout(currentTargetBlock);
            
            currentTargetBlock = null;
            isBusy = false;
            
            // 블록 채굴 후 다음 타깃 서칭 전 휴식 대기 시간 (1.2초)
            setTimeout(() => runMiningTask(), 1200);
        }
    } catch (err) {
        if (currentTargetBlock) {
            console.log(\`[\${bot.username}] \${currentTargetBlock.name} (\${currentTargetBlock.position}) 이동 불가 확인. 다음 나무로 넘어갑니다.\`);
            unreachableBlocks.add(currentTargetBlock.position.toString());
        }
        currentTargetBlock = null;
        isBusy = false;
        setTimeout(() => runMiningTask(), 1000);
    }
}

function stopEverything() {
    isMiningActive = false;
    isBusy = false;
    currentTargetBlock = null;
    unreachableBlocks.clear();
    bot.clearControlStates();
    bot.pathfinder.stop();
}

bot.once("spawn", () => { console.log(\`[\${bot.username}] 개별 프로세스 실행 및 서버 안착 성공!\`); });
bot.on("error", (err) => { console.error(\`[\${bot.username}] ERROR\`, err); });
bot.on("kicked", (reason) => { console.error(\`[\${bot.username}] KICKED\`, reason); });
bot.on("end", () => { console.log(\`[\${bot.username}] 연결 종료\`); });
`;
}

// 🚀 메인 메니저 프로세스 기동
function main() {
    console.log(`[메니저] 총 ${config.BOT_COUNT}개의 개별 JS 파일을 생성하고 병렬 구동합니다.`);

    let currentBotIndex = 1;

    // ⏱️ 500ms 시간차를 두고 순차적으로 프로세스를 실행하여 접속 과부하 방지
    function spawnNextBot() {
        if (currentBotIndex > config.BOT_COUNT) {
            console.log(`[메니저] 모든 봇 (${config.BOT_COUNT}개) 파일 생성 및 독립 프로세스 가동 성공.`);
            
            // 모든 봇이 완전히 켜진 후 5초 뒤에 최초 명령 하달
            setTimeout(() => {
                console.log("\n[메니저] 📢 모든 개별 봇 파일(프로세스)에 일제히 '.나무캐' 명령어 하달!");
                runningProcesses.forEach((child, index) => {
                    if (child.connected) {
                        child.send("mine_logs");
                    } else {
                        console.error(`[메니저 에러] Bot_${index + 1}의 IPC 채널이 닫혀 있어 명령을 전달하지 못했습니다.`);
                    }
                });
            }, 5000);
            return;
        }

        const botName = `Bot_${currentBotIndex}`;
        const fileName = `bot_agent${currentBotIndex}.js`;
        const filePath = path.join(__dirname, fileName);

        // 1. 파일 자동 생성 및 고유 값 주입
        const scriptContent = generateBotTemplate(botName, currentBotIndex);
        fs.writeFileSync(filePath, scriptContent, "utf8");

        // 2. 독립 프로세스로 실행
        const child = fork(filePath);
        
        child.on("exit", (code, signal) => {
            console.log(`[메니저 경고] ${botName} 프로세스가 종료되었습니다. 코드: ${code}, 시그널: ${signal}`);
        });

        runningProcesses.push(child);
        console.log(`[메니저] ${botName} 프로세스 구동 시작... (다음 봇 구동까지 500ms 대기)`);

        currentBotIndex++;
        setTimeout(spawnNextBot, 500);
    }

    // 첫 번째 봇 실행 개시
    spawnNextBot();
}

// 종료 리스너 등록
process.on("exit", () => {
    runningProcesses.forEach(child => child.kill());
});
process.on("SIGINT", () => {
    process.exit();
});

// 실행
main();