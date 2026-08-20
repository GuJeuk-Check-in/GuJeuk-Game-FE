package com.gujeuk.game.match.domain;

public enum Player {
    BLACK,
    WHITE;

    public Player opponent() {
        return this == BLACK ? WHITE : BLACK;
    }

    public String lower() {
        return name().toLowerCase();
    }
}
