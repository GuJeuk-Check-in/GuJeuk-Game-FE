package com.gujeuk.game.tictactoe.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.global.jwt.JwtTokenProvider;
import com.gujeuk.game.member.domain.GameType;
import com.gujeuk.game.member.domain.Member;
import com.gujeuk.game.member.domain.MemberRepository;
import com.gujeuk.game.member.service.MemberGameStatService;
import com.gujeuk.game.tictactoe.domain.TicTacToeRoom;
import com.gujeuk.game.tictactoe.domain.TicTacToeSeat;
import com.gujeuk.game.tictactoe.service.TicTacToeRoomService;
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
 * 틱택토 소켓.
 *
 * 인증은 핸드셰이크 URL의 token 쿼리로 한다. 브라우저 WebSocket API는 헤더를
 * 붙일 수 없어서 Authorization 헤더를 쓸 수 없다.
 *
 * 알까기 소켓과 경로가 다르다(/ws/tic-tac-toe). 한 경로에 게임 종류를 실어
 * 나누는 방법도 있지만, 그러면 한쪽 프로토콜이 바뀔 때 다른 쪽 핸들러까지
 * 흔들린다. 게임이 독립 배포 단위인 것과 같은 이유로 소켓도 나눠 둔다.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class TicTacToeWebSocketHandler extends TextWebSocketHandler {
    private final ObjectMapper objectMapper;
    private final JwtTokenProvider tokenProvider;
    private final MemberRepository memberRepository;
    private final MemberGameStatService statService;
    private final TicTacToeRoomService roomService;

    /** 세션 → 접속자. 방에 들어가기 전에도 누구인지는 알고 있어야 한다. */
    private final Map<String, Connection> connections = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        try {
            Long memberId = tokenProvider.parseMemberId(tokenOf(session));
            Member member = memberRepository.findById(memberId)
                    .orElseThrow(() -> GameException.unauthorized("계정을 찾을 수 없습니다."));

            // 레이팅은 게임별로 따로다. 이 소켓은 틱택토 전용이므로 틱택토 값을 쓴다.
            int rating = statService.getOrCreate(member.getId(), GameType.TIC_TAC_TOE).getRating();

            Connection connection = new Connection(member.getId(), member.getNickname(), rating);
            connections.put(session.getId(), connection);

            send(session, Map.of("type", "READY", "nickname", member.getNickname(), "rating", rating));

            // 끊겼다 돌아온 경우라면 진행 중이던 판으로 되돌린다.
            TicTacToeRoom resumed = roomService.reconnect(member.getId(), session);
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

            // 클라가 보내는 건 "몇 번 칸"뿐이다. 차례·빈 칸·사라질 말은 서버가 정한다.
            case "MOVE" -> withSeat(connection, (room, seat) -> room.move(seat, node.path("index").asInt(-1)));

            case "RESIGN" -> withSeat(connection, TicTacToeRoom::resign);

            default -> send(session, Map.of("type", "ERROR", "message", "알 수 없는 요청입니다: " + type));
        }
    }

    private void withSeat(Connection connection, SeatAction action) {
        TicTacToeRoom room = connection.getRoom();
        if (room == null) throw GameException.badRequest("방에 들어가 있지 않습니다.");

        TicTacToeSeat seat = room.seatOf(connection.memberId());
        if (seat == null) throw GameException.badRequest("이 방의 참가자가 아닙니다.");

        action.run(room, seat);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Connection connection = connections.remove(session.getId());
        if (connection == null || connection.getRoom() == null) return;

        TicTacToeRoom room = connection.getRoom();
        TicTacToeSeat seat = room.seatOf(connection.memberId());

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
        void run(TicTacToeRoom room, TicTacToeSeat seat);
    }

    private static final class Connection {
        private final Long memberId;
        private final String nickname;
        private final int rating;
        private volatile TicTacToeRoom room;

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

        TicTacToeRoom getRoom() {
            return room;
        }

        void setRoom(TicTacToeRoom room) {
            this.room = room;
        }
    }
}
