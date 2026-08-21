package com.gujeuk.game.tictactoe.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.web.socket.WebSocketSession;

/** 방에 앉은 한 명. 재접속하면 session만 갈아 끼우고 나머지는 유지한다. */
@Getter
public class TicTacToeSeat {
    private final Long memberId;
    private final String nickname;
    private final int rating;
    private final Mark mark;

    @Setter
    private WebSocketSession session;

    public TicTacToeSeat(Long memberId, String nickname, int rating, Mark mark, WebSocketSession session) {
        this.memberId = memberId;
        this.nickname = nickname;
        this.rating = rating;
        this.mark = mark;
        this.session = session;
    }

    public boolean isConnected() {
        return session != null && session.isOpen();
    }
}
