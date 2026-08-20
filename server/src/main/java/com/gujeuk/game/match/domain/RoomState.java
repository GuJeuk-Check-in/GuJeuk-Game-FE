package com.gujeuk.game.match.domain;

public enum RoomState {
    /** 방장만 있고 상대를 기다린다. */
    WAITING,
    /** 둘 다 들어왔고 각자 돌을 배치하는 중. */
    PLACING,
    /** 대국 진행 중. */
    PLAYING,
    /** 끝났다. 방은 곧 정리된다. */
    FINISHED
}
