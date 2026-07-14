# Minecraft_auto_chopping_bot

마인크래프트 멀티플레이어 서버의 성능 및 부하(Stress Test) 측정을 위해 개발된 비동기 멀티 에이전트 봇 관리 프로그램입니다(ai를 통해 제작됨).

기계적인 패킷 스팸으로 인해 방화벽에 즉시 차단되는 일반적인 DDoS성 봇과 달리, 실제 플레이어의 행동 패턴(이동, 점프, 자원 채굴)을 정밀하게 모사합니다. 이를 통해 서버의 실제 TPS(Ticks Per Second), CPU 및 RAM 자원 점유율, 네트워크 대역폭, 청크 로딩 부하를 현실적인 환경에서 검증할 수 있도록 설계되었습니다.

## 주요 기능 (Features)

* **순차 접속 제어 (Anti-Spike Login):** 설정된 시간 차(500ms)에 따라 봇이 순차적으로 서버에 진입합니다. 대규모 유저 동시 로그인 시 서버의 인증 세션 처리 능력 및 초기 청크 로드 스파이크를 안정적으로 측정합니다.
* **현실적인 이동 모사 (Human-like Movement):** 달리기(Sprint)를 제한하고 물리 엔진의 걷기 속도를 하향(0.06) 조정하여, 일반 플레이어가 맵을 탐색할 때 발생하는 자연스러운 연산 부하를 서버에 전달합니다.
* **지속적 패킷 유지 (Keep-Alive Jump):** 채굴이나 이동 등 타 제어 상태와 무관하게 설정된 주기마다 독립적으로 점프 패킷을 전송합니다. 유저들이 활발히 움직이는 상황에서의 네트워크 대역폭 및 메모리 누수(Memory Leak)를 누적 테스트합니다.
* **자동 채굴 기반의 부하 생성 (Auto Mining Loop):** 주변의 환경 블록(나무, 돌 등)을 탐색하고 적절한 도구를 장착하여 채굴을 수행함으로써, 서버의 블록 드롭 및 아이템 엔티티 처리 능력을 검증합니다.

## 요구 사항 (Prerequisites)

이 프로그램을 실행하려면 시스템에 아래 환경이 구성되어 있어야 합니다.

* Node.js (LTS 버전 권장, v18 이상)
* 마인크래프트 서버 (동작 확인 버전: 1.20.4)

## 설치 방법 (Installation)

1. 리포지토리를 클론하거나 코드를 다운로드합니다.

```bash
git clone https://github.com/your-username/Minecraft_auto_chopping_bot.git
cd Minecraft_auto_chopping_bot

```

2. Node.js 프로젝트를 초기화하고 필요한 의존성 라이브러리를 설치합니다.

```bash
npm init -y
npm install mineflayer mineflayer-pathfinder

```

## 설정 방법 (Configuration)

실행 전, 프로젝트 루트 폴더 내의 `config.js` 파일을 수정하여 테스트 대상 서버와 봇의 설정을 정의합니다.

```javascript
// config.js
module.exports = {
    SERVER_HOST: "127.0.0.1",      // 테스트 대상 마인크래프트 서버 IP 주소
    SERVER_PORT: 25565,            // 서버 포트 번호
    MINECRAFT_VERSION: "1.20.4",   // 대상 서버의 마인크래프트 버전
    BOT_COUNT: 5,                  // 부하 테스트에 투입할 봇의 총 개수

    // 봇이 탐색 및 채굴하여 부하를 일으킬 블록 이름 리스트
    ALL_LOGS: ["oak_log", "spruce_log", "birch_log", "jungle_log", "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"],
    STONES: ["stone", "cobblestone", "andesite", "diorite", "granite", "deepslate"]
};

```

## 사용 방법 (Usage)

1. **테스트 시작**
설정이 완료되면 메인 관리 스크립트를 실행합니다. 봇들이 차례대로 생성되어 서버에 접속한 후, 자동으로 부하 테스트(채굴 루프) 명령이 일제히 하달됩니다.
```bash
node manager.js

```


2. **테스트 종료**
부하 테스트를 중단하고 모든 봇의 연결을 해제하려면 터미널 창에서 아래 단축키를 입력합니다.
* `Ctrl + C` (프로세스 일괄 종료)



## 주의 사항 (Disclaimer)

본 프로그램은 본인이 소유하거나 사전에 서면으로 테스트 허가를 받은 서버의 성능 측정 및 최적화 용도로만 사용해야 합니다. 허가받지 않은 타인의 서버에 무단으로 다수의 봇을 접속시키는 행위는 서비스 제공 방해에 해당할 수 있으므로 절대 금지합니다.
