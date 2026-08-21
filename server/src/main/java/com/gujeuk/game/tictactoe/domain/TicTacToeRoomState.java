package com.gujeuk.game.tictactoe.domain;

public enum TicTacToeRoomState {
    /** 방장만 있고 상대를 기다린다. */
    WAITING,
    /** 대국 진행 중. */
    PLAYING,
    /** 끝났다. 방은 곧 정리된다. */
    FINISHED
}
