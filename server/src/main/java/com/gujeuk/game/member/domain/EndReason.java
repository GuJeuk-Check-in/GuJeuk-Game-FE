package com.gujeuk.game.member.domain;

/**
 * 판이 끝난 이유.
 *
 * 정상 종료의 이름은 게임마다 다르다. 알까기의 정상 종료는 KNOCKOUT이고
 * 틱택토는 LINE이다. 하나로 묶어 NORMAL 같은 이름을 쓰면 기록만 보고는
 * 무슨 일이 있었는지 알 수 없다.
 */
public enum EndReason {
    /** 알까기: 상대 돌을 모두 떨어뜨렸다. */
    KNOCKOUT,
    /** 틱택토: 세 칸을 이었다. */
    LINE,
    /** 기권 버튼을 눌렀다. */
    RESIGN,
    /** 재접속 유예를 넘겨 몰수패. */
    DISCONNECT
}
