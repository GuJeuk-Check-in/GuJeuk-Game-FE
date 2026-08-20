package com.gujeuk.game.match.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.global.jwt.JwtTokenProvider;
import com.gujeuk.game.match.domain.Player;
import com.gujeuk.game.match.domain.Room;
import com.gujeuk.game.match.domain.Seat;
import com.gujeuk.game.match.domain.Skill;
import com.gujeuk.game.match.domain.Stone;
import com.gujeuk.game.match.service.RoomService;
import com.gujeuk.game.member.domain.Member;
import com.gujeuk.game.member.domain.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 게임 소켓.
 *
 * 인증은 핸드셰이크 URL의 token 쿼리로 한다. 브라우저 WebSocket API는 헤더를
 * 붙일 수 없어서 Authorization 헤더를 쓸 수 없다.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class GameWebSocketHandler extends TextWebSocketHandler {
    private final ObjectMapper objectMapper;
    private final JwtTokenProvider tokenProvider;
    private final MemberRepository memberRepository;
    private final RoomService roomService;

    /** 세션 → 접속자. 방에 들어가기 전에도 누구인지는 알고 있어야 한다. */
    private final Map<String, Connection> connections = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        try {
            Long memberId = tokenProvider.parseMemberId(tokenOf(session));
            Member member = memberRepository.findById(memberId)
                    .orElseThrow(() -> GameException.unauthorized("계정을 찾을 수 없습니다."));

            connections.put(session.getId(), new Connection(member.getId(), member.getNickname(), member.getRating()));
            send(session, Map.of("type", "READY", "nickname", member.getNickname(), "rating", member.getRating()));
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
            case "CREATE_ROOM" -> {
                Room room = roomService.create(
                        connection.memberId(), connection.nickname(), connection.rating(), session);
                connection.setRoom(room);
            }
            case "JOIN_ROOM" -> {
                Room room = roomService.join(node.path("code").asText(),
                        connection.memberId(), connection.nickname(), connection.rating(), session);
                connection.setRoom(room);
            }
            case "PLACE" -> withSeat(connection, (room, seat) -> room.place(seat, stones(node)));
            case "FLICK" -> withSeat(connection, (room, seat) -> room.flick(
                    seat,
                    node.path("stoneId").asInt(),
                    node.path("vx").asDouble(),
                    node.path("vy").asDouble()));
            case "TURN_END" -> withSeat(connection, (room, seat) -> room.turnEnd(
                    seat,
                    node.path("hash").asText(),
                    node.path("black").asInt(),
                    node.path("white").asInt(),
                    firstZero(node)));
            case "SKILL" -> withSeat(connection, (room, seat) -> room.useSkill(
                    seat,
                    Skill.valueOf(node.path("skill").asText().toUpperCase()),
                    node.path("stoneId").asInt()));
            case "RESIGN" -> withSeat(connection, Room::resign);
            default -> send(session, Map.of("type", "ERROR", "message", "알 수 없는 요청입니다: " + type));
        }
    }

    /** 먼저 비운 색. 동시에 비었거나 아직 아무도 안 비었으면 null이다. */
    private Player firstZero(JsonNode node) {
        JsonNode value = node.path("firstZero");
        if (value.isMissingNode() || value.isNull()) return null;

        String text = value.asText();
        return text.isBlank() ? null : Player.valueOf(text.toUpperCase());
    }

    private List<Stone> stones(JsonNode node) {
        List<Stone> stones = new ArrayList<>();
        for (JsonNode stone : node.path("stones")) {
            stones.add(new Stone(stone.path("x").asDouble(), stone.path("y").asDouble()));
        }
        return stones;
    }

    private void withSeat(Connection connection, SeatAction action) {
        Room room = connection.getRoom();
        if (room == null) throw GameException.badRequest("방에 들어가 있지 않습니다.");

        Seat seat = room.seatOf(connection.memberId());
        if (seat == null) throw GameException.badRequest("이 방의 참가자가 아닙니다.");

        action.run(room, seat);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Connection connection = connections.remove(session.getId());
        if (connection == null || connection.getRoom() == null) return;

        Room room = connection.getRoom();
        Seat seat = room.seatOf(connection.memberId());
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
                return java.net.URLDecoder.decode(parts[1], java.nio.charset.StandardCharsets.UTF_8);
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
        void run(Room room, Seat seat);
    }

    private static final class Connection {
        private final Long memberId;
        private final String nickname;
        private final int rating;
        private volatile Room room;

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

        Room getRoom() {
            return room;
        }

        void setRoom(Room room) {
            this.room = room;
        }
    }
}
