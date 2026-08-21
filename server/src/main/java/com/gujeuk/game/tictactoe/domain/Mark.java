package com.gujeuk.game.tictactoe.domain;

public enum Mark {
    X,
    O;

    public Mark opponent() {
        return this == X ? O : X;
    }

    public String lower() {
        return name().toLowerCase();
    }
}
