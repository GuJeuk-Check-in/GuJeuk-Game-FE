package com.gujeuk.game.archery.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gujeuk.game.archery.domain.ArcheryRoom;
import com.gujeuk.game.archery.domain.ArcherySeat;
import com.gujeuk.game.archery.service.ArcheryRoomService;
import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.global.jwt.JwtTokenProvider;
import com.gujeuk.game.member.domain.GameType;
import com.gujeuk.game.member.domain.Member;
import com.gujeuk.game.member.domain.MemberRepository;
import com.gujeuk.game.member.service.MemberGameStatService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 양궁 소켓.
 *
 * 인증은 핸드셰이크 URL의 token 쿼리로 한다. 브라우저 WebSocket API는 헤더를
 * 붙일 수 없어서 Authorization 헤더를 쓸 수 없다.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class ArcheryWebSocketHandler extends TextWebSocketHandler {
    private final ObjectMapper objectMapper;
    private final JwtTokenProvider tokenProvider;
    private final MemberRepository memberRepository;
    private final MemberGameStatService statService;
    private final ArcheryRoomService roomService;

    private final Map<String, Connection> connections = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        try {
            Long memberId = tokenProvider.parseMemberId(tokenOf(session));
            Member member = memberRepository.findById(memberId)
                    .orElseThrow(() -> GameException.unauthorized("계정을 찾을 수 없습니다."));

            // 레이팅은 게임별로 따로다. 이 소켓은 양궁 전용이므로 양궁 값을 쓴다.
            int rating = statService.getOrCreate(member.getId(), GameType.ARCHERY).getRating();

            Connection connection = new Connection(member.getId(), member.getNickname(), rating);
            connections.put(session.getId(), connection);

            send(session, Map.of("type", "READY", "nickname", member.getNickname(), "rating", rating));

            ArcheryRoom resumed = roomService.reconnect(member.getId(), session);
            if (resumed != null) connection.setRoom(resumed);
        } catch (Exception exception) {
            send(session, Map.of("type", "ERROR", "message", "인증에 실패했습니다."));
            session.close(CloseStatus.NOT_ACCEPTABLE);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        Connection connection = connections.get(session.getId());
        if (connection == null) return;

        try {
            JsonNode node = objectMapper.readTree(message.getPayload());
            dispatch(session, connection, node);
        } catch (GameException exception) {
            send(session, Map.of("type", "ERROR", "message", exception.getMessage()));
        } catch (Exception exception) {
            log.debug("메시지 처리 실패", exception);
            send(session, Map.of("type", "ERROR", "message", "요청을 처리하지 못했습니다."));
        }
    }

    private void dispatch(WebSocketSession session, Connection connection, JsonNode node) {
        String type = node.path("type").asText();

        switch (type) {
            case "CREATE_ROOM" -> connection.setRoom(roomService.create(
                    connection.memberId(), connection.nickname(), connection.rating(), session));

            case "JOIN_ROOM" -> connection.setRoom(roomService.join(
                    node.path("code").asText(),
                    connection.memberId(), connection.nickname(), connection.rating(), session));

            // 각도·세기는 상대 화면에서 같은 화살을 재생하는 데 쓰고,
            // 점수는 쏜 쪽이 계산한 값을 범위만 확인하고 받는다.
            case "SHOT" -> withSeat(connection, (room, seat) -> room.shoot(
                    seat,
                    node.path("angle").asDouble(),
                    node.path("power").asDouble(),
                    node.path("score").asInt(-1)));

            case "RESIGN" -> withSeat(connection, ArcheryRoom::resign);

            // 로비로 돌아갈 때 보낸다. 이걸 안 보내면 방이 서버에 그대로 남아
            // 재접속이 그 방을 찾아 붙는다.
            case "LEAVE_ROOM" -> {
                withSeat(connection, ArcheryRoom::leave);
                connection.setRoom(null);
            }

            default -> send(session, Map.of("type", "ERROR", "message", "알 수 없는 요청입니다: " + type));
        }
    }

    private void withSeat(Connection connection, SeatAction action) {
        ArcheryRoom room = connection.getRoom();
        if (room == null) throw GameException.badRequest("방에 들어가 있지 않습니다.");

        ArcherySeat seat = room.seatOf(connection.memberId());
        if (seat == null) throw GameException.badRequest("이 방의 참가자가 아닙니다.");

        action.run(room, seat);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Connection connection = connections.remove(session.getId());
        if (connection == null || connection.getRoom() == null) return;

        ArcheryRoom room = connection.getRoom();
        ArcherySeat seat = room.seatOf(connection.memberId());

        // 이미 다른 세션으로 돌아온 뒤라면 그 세션을 끊으면 안 된다.
        if (seat != null && seat.getSession() == session) {
            room.disconnect(seat);
        }
    }

    private String tokenOf(WebSocketSession session) {
        URI uri = session.getUri();
        String query = uri == null ? null : uri.getQuery();
        if (query == null) throw GameException.unauthorized("토큰이 없습니다.");

        for (String pair : query.split("&")) {
            String[] parts = pair.split("=", 2);
            if (parts.length == 2 && parts[0].equals("token")) {
                return URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
            }
        }

        throw GameException.unauthorized("토큰이 없습니다.");
    }

    private void send(WebSocketSession session, Map<String, Object> message) {
        try {
            synchronized (session) {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(message)));
            }
        } catch (Exception exception) {
            log.debug("전송 실패: {}", exception.getMessage());
        }
    }

    @FunctionalInterface
    private interface SeatAction {
        void run(ArcheryRoom room, ArcherySeat seat);
    }

    private static final class Connection {
        private final Long memberId;
        private final String nickname;
        private final int rating;
        private volatile ArcheryRoom room;

        private Connection(Long memberId, String nickname, int rating) {
            this.memberId = memberId;
            this.nickname = nickname;
            this.rating = rating;
        }

        Long memberId() {
            return memberId;
        }

        String nickname() {
            return nickname;
        }

        int rating() {
            return rating;
        }

        ArcheryRoom getRoom() {
            return room;
        }

        void setRoom(ArcheryRoom room) {
            this.room = room;
        }
    }
}
