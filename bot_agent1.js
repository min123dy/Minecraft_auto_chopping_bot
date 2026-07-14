const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const GoalLookAtBlock = goals.GoalLookAtBlock;
const config = require("./config");

const privateApi = {
    endpoint: "https://api.custom-service.com/v1/bots/Bot_1",
    token: "secret_token_key_Bot_1",
    id: 1
};

const bot = mineflayer.createBot({
    host: config.SERVER_HOST,
    port: config.SERVER_PORT,
    username: "Bot_1",
    version: config.MINECRAFT_VERSION,
    connectTimeout: 8000,
    viewDistance: "tiny"
});

process.on("uncaughtException", (err) => {
    console.error(`[${bot.username}] Uncaught Exception`);
    console.error(err);
});

process.on("unhandledRejection", (err) => {
    console.error(`[${bot.username}] Unhandled Rejection`);
    console.error(err);
});

bot.loadPlugin(pathfinder);

// [강제 점프 시스템] 다른 모든 동작/컨트롤과 무관하게 특정 주기마다 무조건 점프 시도
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
}, 4000); // 4000ms = 4초 주기 (원하는 초 단위 주기로 이 숫자를 변경하시면 됩니다)


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
    
    // [속도 제어] 달리기를 원천 차단하고 오직 걷기만 수행
    defaultMove.allowSprinting = false; 
    
    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.thinkTimeout = 1000;
    bot.pathfinder.maxPathCount = 2000;

    // [속도 제어] 물리 엔진의 기본 걷기 속도(0.1)를 0.06으로 하향하여 일반 플레이어보다 느리게 이동
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
            console.log(`[${bot.username}] ${currentTargetBlock.name} (${currentTargetBlock.position}) 이동 불가 확인. 다음 나무로 넘어갑니다.`);
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

bot.once("spawn", () => { console.log(`[${bot.username}] 개별 프로세스 실행 및 서버 안착 성공!`); });
bot.on("error", (err) => { console.error(`[${bot.username}] ERROR`, err); });
bot.on("kicked", (reason) => { console.error(`[${bot.username}] KICKED`, reason); });
bot.on("end", () => { console.log(`[${bot.username}] 연결 종료`); });
