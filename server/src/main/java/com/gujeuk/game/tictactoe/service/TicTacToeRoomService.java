package com.gujeuk.game.tictactoe.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.match.service.MatchResultService;
import com.gujeuk.game.member.domain.EndReason;
import com.gujeuk.game.member.domain.GameType;
import com.gujeuk.game.tictactoe.domain.TicTacToeRoom;
import com.gujeuk.game.tictactoe.domain.TicTacToeRoomListener;
import com.gujeuk.game.tictactoe.domain.TicTacToeSeat;
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
 * 틱택토 방을 만들고 찾고 정리한다. 방이 바깥과 이야기할 때 쓰는 통로이기도 하다.
 *
 * 알까기의 RoomService와 뼈대가 같다(코드 생성·레지스트리·전송·스케줄). 지금은
 * 각 게임이 자기 것을 갖고 있는데, 세 번째 게임이 붙는 시점에 공통으로 빼는 게
 * 맞다. 지금 미리 빼면 알까기가 돌아가는 코드를 건드리는 위험이 이득보다 크다.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TicTacToeRoomService implements TicTacToeRoomListener {
    /** 헷갈리는 글자(0/O, 1/I)를 뺀 코드용 알파벳. */
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 6;

    private final ObjectMapper objectMapper;
    private final MatchResultService matchResultService;

    private final Map<String, TicTacToeRoom> rooms = new ConcurrentHashMap<>();
    private final Random random = new SecureRandom();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

    public TicTacToeRoom create(Long memberId, String nickname, int rating, WebSocketSession session) {
        String code = generateCode();
        TicTacToeRoom room = new TicTacToeRoom(code, this, random);
        rooms.put(code, room);

        room.open(memberId, nickname, rating, session);
        return room;
    }

    public TicTacToeRoom join(String code, Long memberId, String nickname, int rating, WebSocketSession session) {
        TicTacToeRoom room = rooms.get(normalize(code));
        if (room == null) throw GameException.badRequest("그런 방이 없습니다.");

        room.join(memberId, nickname, rating, session);
        return room;
    }

    /** 끊겼다 돌아온 사람이 원래 자리로 복귀할 방을 찾는다. 없으면 null. */
    public TicTacToeRoom reconnect(Long memberId, WebSocketSession session) {
        for (TicTacToeRoom room : rooms.values()) {
            if (room.seatOf(memberId) != null && room.reconnect(memberId, session)) {
                return room;
            }
        }
        return null;
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

    // ---- TicTacToeRoomListener --------------------------------------------

    @Override
    public void send(TicTacToeSeat seat, Map<String, Object> message) {
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
    public void broadcast(TicTacToeRoom room, Map<String, Object> message) {
        send(room.getHost(), message);
        send(room.getGuest(), message);
    }

    @Override
    public RatingChange finish(Long winnerId, Long loserId, EndReason reason) {
        // 이 방은 틱택토 전용이다. 방은 자기가 무슨 게임인지 몰라도 되도록
        // 게임 종류를 여기서 붙인다.
        var result = matchResultService.apply(GameType.TIC_TAC_TOE, winnerId, loserId, reason);
        return new RatingChange(result.delta(), result.winnerRating(), result.loserRating());
    }

    @Override
    public void dispose(TicTacToeRoom room) {
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
