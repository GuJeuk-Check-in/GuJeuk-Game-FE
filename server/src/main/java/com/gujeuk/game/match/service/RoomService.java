package com.gujeuk.game.match.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.match.domain.Room;
import com.gujeuk.game.match.domain.RoomListener;
import com.gujeuk.game.match.domain.Seat;
import com.gujeuk.game.member.domain.EndReason;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * 방을 만들고 찾고 정리한다. 방이 바깥과 이야기할 때 쓰는 통로(RoomListener)이기도 하다.
 *
 * 방 상태는 메모리에만 있다. 서버가 내려가면 진행 중인 판은 사라지는데,
 * 한 판이 몇 분짜리라 DB에 넣어 얻는 것보다 잃는 게 크다. 끝난 판만 저장한다.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class RoomService implements RoomListener {
    /** 헷갈리는 글자(0/O, 1/I)를 뺀 코드용 알파벳. */
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 6;

    private final ObjectMapper objectMapper;
    private final MatchResultService matchResultService;

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Random random = new SecureRandom();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

    public Room create(Long memberId, String nickname, int rating, WebSocketSession session) {
        String code = generateCode();
        Room room = new Room(code, this, random);
        rooms.put(code, room);

        room.open(memberId, nickname, rating, session);
        return room;
    }

    public Room join(String code, Long memberId, String nickname, int rating, WebSocketSession session) {
        Room room = rooms.get(normalize(code));
        if (room == null) throw GameException.badRequest("그런 방이 없습니다.");

        room.join(memberId, nickname, rating, session);
        return room;
    }

    private String generateCode() {
        for (int attempt = 0; attempt < 20; attempt += 1) {
            StringBuilder builder = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i += 1) {
                builder.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            }

            String code = builder.toString();
            if (!rooms.containsKey(code)) return code;
        }

        throw GameException.conflict("방 코드를 만들지 못했습니다. 잠시 후 다시 시도해주세요.");
    }

    private String normalize(String code) {
        return code == null ? "" : code.trim().toUpperCase();
    }

    // ---- RoomListener -----------------------------------------------------

    @Override
    public void send(Seat seat, Map<String, Object> message) {
        if (seat == null || !seat.isConnected()) return;

        try {
            String payload = objectMapper.writeValueAsString(message);
            // 같은 세션에 두 스레드가 동시에 쓰면 Jetty/Tomcat 모두 깨진다.
            synchronized (seat.getSession()) {
                seat.getSession().sendMessage(new TextMessage(payload));
            }
        } catch (IOException exception) {
            log.debug("메시지 전송 실패: {}", exception.getMessage());
        }
    }

    @Override
    public void broadcast(Room room, Map<String, Object> message) {
        send(room.getHost(), message);
        send(room.getGuest(), message);
    }

    @Override
    public RatingChange finish(Long winnerId, Long loserId, EndReason reason) {
        var result = matchResultService.apply(winnerId, loserId, reason);
        return new RatingChange(result.delta(), result.winnerRating(), result.loserRating());
    }

    @Override
    public void dispose(Room room) {
        rooms.remove(room.getCode());
    }

    @Override
    public Cancellable schedule(Runnable task, int delaySec) {
        ScheduledFuture<?> future = scheduler.schedule(task, delaySec, TimeUnit.SECONDS);
        return () -> future.cancel(false);
    }

    @PreDestroy
    void shutdown() {
        scheduler.shutdownNow();
    }
}
