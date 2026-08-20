package com.gujeuk.game.global.error;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class GameException extends RuntimeException {
    private final HttpStatus status;

    public GameException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public static GameException badRequest(String message) {
        return new GameException(HttpStatus.BAD_REQUEST, message);
    }

    public static GameException conflict(String message) {
        return new GameException(HttpStatus.CONFLICT, message);
    }

    public static GameException unauthorized(String message) {
        return new GameException(HttpStatus.UNAUTHORIZED, message);
    }
}
