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
    viewDistance: "short"
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

let isMiningActive = false;
let isBusy = false;
let currentTargetBlock = null;
let currentBlockNames = [];
const unreachableBlocks = new Set();

// [탐색 범위 확장 시스템]
const BASE_SEARCH_RADIUS = 32;
const MAX_SEARCH_RADIUS = 64;
const SEARCH_RADIUS_STEP = 16;
let currentSearchRadius = BASE_SEARCH_RADIUS;
let hasRetriedAtCurrentRadius = false; // 현재 범위에서 블랙리스트 초기화 후 재시도했는지 여부
let isExploring = false;

// [위치 기반 워치독 시스템]
let lastCheckPosition = null;

// 7초마다 실행하여 실제 이동 거리가 사실상 0 (0.00m)일 때만 강제 리셋
setInterval(() => {
    if (!isMiningActive || !bot.entity || isExploring) {
        lastCheckPosition = null;
        return;
    }

    const currentPos = bot.entity.position;

    if (lastCheckPosition) {
        const distanceMoved = currentPos.distanceTo(lastCheckPosition);

        // 이동 거리가 0.01m 미만(소수점 둘째 자리 반올림 기준 0.00m)일 때만 스턱으로 간주
        if (distanceMoved < 0.01) {
            console.log(`[${bot.username}] 7초 동안 완전히 멈춤 감지 (이동 거리: ${distanceMoved.toFixed(2)}m). 작업을 강제 초기화하고 재시작합니다.`);

            stopEverything();
            lastCheckPosition = null; // 체크 위치 초기화

            setTimeout(() => {
                startMiningLoop(currentBlockNames);
            }, 1000);
            return;
        }
    }

    // 현재 위치 복사하여 저장 (다음 7초 후에 비교)
    lastCheckPosition = currentPos.clone();
}, 7000); // 7초 주기

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
    lastCheckPosition = null; // 루프 시작 시 위치 기록 리셋
    currentSearchRadius = BASE_SEARCH_RADIUS; // 탐색 범위 초기화
    hasRetriedAtCurrentRadius = false;

    const defaultMove = new Movements(bot);
    defaultMove.canDig = true;
    defaultMove.canPlaceOn = true;
    defaultMove.scaffoldingBlocks = ['dirt', 'cobblestone', 'stone'];
    
    defaultMove.allowSprinting = false; 
    
    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.thinkTimeout = 1000;
    bot.pathfinder.maxPathCount = 2000;
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
            const matchingBlocks = bot.findBlocks({ matching: targetIds, maxDistance: currentSearchRadius, count: 40 });

            let selectedBlock = null;

            if (matchingBlocks.length > 0) {
                let startIndex = privateApi.id % matchingBlocks.length;

                for (let i = 0; i < matchingBlocks.length; i++) {
                    const checkIndex = (startIndex + i) % matchingBlocks.length;
                    const pos = matchingBlocks[checkIndex];
                    
                    if (!unreachableBlocks.has(pos.toString())) {
                        selectedBlock = bot.blockAt(pos);
                        break;
                    }
                }
            }

            currentTargetBlock = selectedBlock;

            if (currentTargetBlock) {
                // 유효한 타겟을 찾았으니 다음 탐색을 위해 범위와 재시도 플래그를 초기화
                currentSearchRadius = BASE_SEARCH_RADIUS;
                hasRetriedAtCurrentRadius = false;
            }
        }

        if (!currentTargetBlock) {
            if (!hasRetriedAtCurrentRadius) {
                // 범위를 넓히기 전에, 현재 범위에서 블랙리스트를 초기화하고 한 번 더 시도
                hasRetriedAtCurrentRadius = true;
                console.log(`[${bot.username}] ${currentSearchRadius}블럭 내 유효 대상 없음. 블랙리스트 초기화 후 같은 범위에서 재시도합니다.`);
                unreachableBlocks.clear();
                isBusy = false;
                setTimeout(() => { runMiningTask(); }, 1500);
                return;
            }

            if (currentSearchRadius < MAX_SEARCH_RADIUS) {
                // 블랙리스트를 초기화해도 대상이 없다면 탐색 범위를 확장
                const previousRadius = currentSearchRadius;
                currentSearchRadius = Math.min(currentSearchRadius + SEARCH_RADIUS_STEP, MAX_SEARCH_RADIUS);
                hasRetriedAtCurrentRadius = false; // 새 범위에서는 재시도 플래그 초기화
                console.log(`[${bot.username}] ${previousRadius}블럭 내 채굴 대상 없음. 탐색 범위를 ${currentSearchRadius}블럭으로 확장합니다.`);
                unreachableBlocks.clear();
                isBusy = false;
                setTimeout(() => { runMiningTask(); }, 1500);
                return;
            } else {
                // 최대 범위(64블럭)까지도 대상이 없으면 랜덤 방향으로 탐험 이동
                isBusy = false;
                exploreForNewArea();
                return;
            }
        }

        const distance = bot.entity.position.distanceTo(currentTargetBlock.position);

        async function gotoWithTimeout(goal, ms = 5000) {
            return Promise.race([
                bot.pathfinder.goto(goal),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Goto timeout")), ms))
            ]);
        }

        if (distance > 4.2) {
            const goal = new GoalLookAtBlock(currentTargetBlock.position, bot.world);
            await gotoWithTimeout(goal);
            isBusy = false;
            setTimeout(() => runMiningTask(), 1000);
        } else {
            if (bot.game.gameMode === "survival") {
                const tool = bot.pathfinder.bestHarvestTool(currentTargetBlock);
                if (tool) await bot.equip(tool, "hand");
            }
            
            async function lookWithTimeout(pos, ms = 3000) {
                return Promise.race([
                    bot.lookAt(pos),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Look timeout")), ms))
                ]);
            }

            await lookWithTimeout(currentTargetBlock.position.offset(0.5, 0.5, 0.5));

            async function digWithTimeout(block, ms = 5000) {
                return Promise.race([
                    bot.dig(block, true),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Dig timeout")), ms))
                ]);
            }
            await digWithTimeout(currentTargetBlock);
            
            currentTargetBlock = null;
            isBusy = false;
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

// [탐험 이동] 64블럭 내에도 채굴 대상이 없을 때, 랜덤 방향을 보고
// 점프하며 앞으로 걸어가 새로운 구역을 확보한 뒤 다시 탐색을 시작한다.
function exploreForNewArea() {
    if (isExploring || !isMiningActive) return;
    isExploring = true;

    const randomYaw = (Math.random() * Math.PI * 2) - Math.PI; // -PI ~ PI
    console.log(`[${bot.username}] ${MAX_SEARCH_RADIUS}블럭 내 채굴 대상 없음. 랜덤 방향(${randomYaw.toFixed(2)}rad)으로 탐험 이동을 시작합니다.`);

    try {
        bot.look(randomYaw, 0, true);
    } catch (err) {
        console.error(`[${bot.username}] 탐험 방향 설정 실패`, err);
    }

    bot.setControlState("forward", true);
    bot.setControlState("jump", true);
    bot.setControlState("sprint", false);

    const EXPLORE_DURATION_MS = 10000;

    setTimeout(() => {
        bot.setControlState("forward", false);
        bot.setControlState("jump", false);

        isExploring = false;
        currentSearchRadius = BASE_SEARCH_RADIUS; // 새 위치 기준으로 다시 32블럭부터 탐색
        hasRetriedAtCurrentRadius = false;
        unreachableBlocks.clear();

        if (isMiningActive) {
            runMiningTask();
        }
    }, EXPLORE_DURATION_MS);
}

function stopEverything() {
    isMiningActive = false;
    isBusy = false;
    isExploring = false;
    currentTargetBlock = null;
    currentSearchRadius = BASE_SEARCH_RADIUS;
    hasRetriedAtCurrentRadius = false;
    unreachableBlocks.clear();
    bot.clearControlStates();
    bot.pathfinder.stop();
}

bot.once("spawn", () => { console.log(`[${bot.username}] 개별 프로세스 실행 및 서버 안착 성공!`); });
bot.on("error", (err) => { console.error(`[${bot.username}] ERROR`, err); });
bot.on("kicked", (reason) => { console.error(`[${bot.username}] KICKED`, reason); });
bot.on("end", () => { console.log(`[${bot.username}] 연결 종료`); });
