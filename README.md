# Minecraft_auto_chopping_bot

마인크래프트 서버의 성능 및 부하(Stress Test) 측정을 위해 개발된 비동기 멀티 에이전트 봇 관리 프로그램입니다.

여러 개의 봇이 실제 플레이어처럼 이동, 점프, 자원 채굴 등의 행동을 수행하여 서버의 TPS(Ticks Per Second), CPU 및 RAM 사용량, 네트워크 처리량, 청크 로딩 성능 등을 테스트할 수 있도록 설계되었습니다.

---

# 주요 기능 (Features)

* **순차 접속 제어 (Sequential Login)**
  설정된 시간 간격(기본 500ms)으로 봇이 순차적으로 서버에 접속하여 로그인 시 발생하는 부하를 측정합니다.

* **현실적인 이동 모사 (Human-like Movement)**
  걷기 속도와 이동 방식을 조정하여 일반 플레이어와 유사한 행동 패턴을 재현합니다.

* **주기적인 점프 동작 (Periodic Jump)**
  이동 및 채굴과 별개로 일정 주기마다 점프를 수행하여 지속적인 플레이 환경을 재현합니다.

* **자동 채굴 (Auto Mining Loop)**
  주변의 나무와 돌 등의 블록을 탐색하고 적절한 도구를 사용하여 채굴을 수행합니다.

---

# 요구 사항 (Prerequisites)

이 프로그램을 실행하려면 시스템에 아래 환경이 구성되어 있어야 합니다.

* Node.js (LTS 버전 권장, v18 이상)
* 마인크래프트 서버 (동작 확인 버전: 1.20.4)

---

# 참고

기본적으로 Mineflayer 봇은 Microsoft 계정 인증을 사용하지 않는 환경에서 테스트하는 것이 가장 간편합니다.

로컬 테스트 또는 개발 환경에서는 서버의 `server.properties`에서 `online-mode=false`로 설정한 후 실행하는 것을 권장합니다.

실제 서버를 운영하거나 일반 플레이어가 접속하는 환경에서는 테스트가 끝난 뒤 반드시 `online-mode=true`로 다시 변경하여 사용하는 것을 권장합니다.

---

# 설치 방법 (Installation)

리포지토리를 클론하거나 코드를 다운로드합니다.

```bash
git clone https://github.com/min123dy/Minecraft_auto_chopping_bot.git
cd Minecraft_auto_chopping_bot
```

Node.js 프로젝트를 초기화하고 필요한 의존성 라이브러리를 설치합니다.

```bash
npm init -y
npm install mineflayer mineflayer-pathfinder
```

---

# 설정 방법 (Configuration)

실행 전, 프로젝트 루트 폴더 내의 `config.js` 파일을 수정하여 테스트 대상 서버와 봇의 설정을 정의합니다.

```javascript
// config.js
module.exports = {
    SERVER_HOST: "127.0.0.1",
    SERVER_PORT: 25565,
    MINECRAFT_VERSION: "1.20.4",
    BOT_COUNT: 5,

    ALL_LOGS: [
        "oak_log",
        "spruce_log",
        "birch_log",
        "jungle_log",
        "acacia_log",
        "dark_oak_log",
        "mangrove_log",
        "cherry_log"
    ],

    STONES: [
        "stone",
        "cobblestone",
        "andesite",
        "diorite",
        "granite",
        "deepslate"
    ]
};
```

---

# 사용 방법 (Usage)

## 테스트 시작

설정이 완료되면 메인 관리 스크립트를 실행합니다.

```bash
node manager.js
```

봇들이 순차적으로 서버에 접속한 후 자동으로 이동 및 채굴을 시작합니다.

## 테스트 종료

모든 봇을 종료하려면 터미널에서 다음을 입력합니다.

```text
Ctrl + C
```

---

# 주의 사항 (Disclaimer)

본 프로그램은 자신이 소유하거나 테스트 허가를 받은 마인크래프트 서버의 성능 측정 및 개발 환경에서의 검증 목적으로 사용해야 합니다.

테스트 환경에서는 필요에 따라 `online-mode=false`를 사용할 수 있으나, 실제 운영 서버에서는 테스트가 끝난 후 `online-mode=true`로 복원하여 사용하는 것을 권장합니다.
