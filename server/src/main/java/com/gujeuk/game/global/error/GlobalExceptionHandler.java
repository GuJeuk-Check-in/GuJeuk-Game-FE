package com.gujeuk.game.global.error;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
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

    /**
     * 본문을 JSON으로 읽지 못한 경우. 예: 본문이 통째로 없거나 중간에 끊긴 세이브.
     *
     * 위의 필수 파라미터와 같은 이유로 여기서 끝낸다. 잡지 않으면 Spring이
     * /error로 넘기는데 그 경로는 인증을 요구하므로, 클라이언트는 400 대신
     * 403을 받고 "권한이 없다"로 읽는다.
     *
     * 예외에서 상세를 꺼내 붙이지 않는 것은 일부러다. 파싱 실패 메시지에는 읽다
     * 만 본문 조각이 그대로 들어 있어서, 붙이면 요청 내용을 그대로 되돌려 준다.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleUnreadableBody() {
        return ResponseEntity.badRequest()
                .body(Map.of("message", "요청 본문을 읽을 수 없습니다."));
    }

    /** 값을 타입으로 바꾸지 못한 경우. 예: ?game=NOPE 처럼 없는 게임 이름. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, String>> handleTypeMismatch(
            MethodArgumentTypeMismatchException exception) {
        return ResponseEntity.badRequest()
                .body(Map.of("message", "값이 올바르지 않습니다: " + exception.getName()));
    }
}
