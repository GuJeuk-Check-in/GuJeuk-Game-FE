package com.gujeuk.game.member.domain;

public enum EndReason {
    /** 상대 돌을 모두 떨어뜨렸다. */
    KNOCKOUT,
    /** 기권 버튼을 눌렀다. */
    RESIGN,
    /** 재접속 유예를 넘겨 몰수패. */
    DISCONNECT
}
