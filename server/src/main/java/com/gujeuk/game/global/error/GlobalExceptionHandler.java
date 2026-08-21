package com.gujeuk.game.global.error;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(GameException.class)
    public ResponseEntity<Map<String, String>> handleGame(GameException exception) {
        return ResponseEntity.status(exception.getStatus())
                .body(Map.of("message", exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleInvalid(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getDefaultMessage())
                .orElse("잘못된 요청입니다.");

        return ResponseEntity.badRequest().body(Map.of("message", message));
    }

    /**
     * 필수 쿼리 파라미터가 빠진 경우.
     *
     * 여기서 잡지 않으면 Spring이 /error 로 넘기는데, 그 경로는 인증을 요구하므로
     * 클라이언트는 400 대신 403을 받는다. "권한이 없다"로 보여서 원인을 찾기
     * 어려워지므로 반드시 여기서 끝낸다.
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, String>> handleMissingParam(
            MissingServletRequestParameterException exception) {
        return ResponseEntity.badRequest()
                .body(Map.of("message", "필수 값이 빠졌습니다: " + exception.getParameterName()));
    }

    /** 값을 타입으로 바꾸지 못한 경우. 예: ?game=NOPE 처럼 없는 게임 이름. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, String>> handleTypeMismatch(
            MethodArgumentTypeMismatchException exception) {
        return ResponseEntity.badRequest()
                .body(Map.of("message", "값이 올바르지 않습니다: " + exception.getName()));
    }
}
