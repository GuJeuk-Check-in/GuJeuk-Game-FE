package com.gujeuk.game.match.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;

/** 방에 앉은 한 명. 재접속하면 session만 갈아 끼우고 나머지는 유지한다. */
@Getter
public class Seat {
    private final Long memberId;
    private final String nickname;
    private final int rating;
    private final Player color;

    @Setter
    private WebSocketSession session;

    @Setter
    private List<Stone> placement;

    @Setter
    private TurnReport report;

    /** 턴 제한 시간을 연속으로 넘긴 횟수. 계속 방치하는 상대를 끝내기 위한 값. */
    @Setter
    private int consecutiveTimeouts;

    public Seat(Long memberId, String nickname, int rating, Player color, WebSocketSession session) {
        this.memberId = memberId;
        this.nickname = nickname;
        this.rating = rating;
        this.color = color;
        this.session = session;
    }

    public boolean isConnected() {
        return session != null && session.isOpen();
    }

    /** 턴이 끝난 뒤 클라가 보고한 최종 상태. 양쪽 값을 대조해 치팅·디싱크를 잡는다. */
    public record TurnReport(String hash, int black, int white) {
    }
}
