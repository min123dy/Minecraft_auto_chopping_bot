// config.js
module.exports = {
    SERVER_HOST: "127.0.0.1",      // 테스트 대상 마인크래프트 서버 IP 주소
    SERVER_PORT: 25565,            // 서버 포트 번호
    MINECRAFT_VERSION: "1.20.4",   // 대상 서버의 마인크래프트 버전
    BOT_COUNT: 1,                  // 부하 테스트에 투입할 봇의 총 개수

    // 봇이 탐색 및 채굴하여 부하를 일으킬 블록 이름 리스트
    ALL_LOGS: ["oak_log", "spruce_log", "birch_log", "jungle_log", "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"],
    STONES: ["stone", "cobblestone", "andesite", "diorite", "granite", "deepslate"]
};
