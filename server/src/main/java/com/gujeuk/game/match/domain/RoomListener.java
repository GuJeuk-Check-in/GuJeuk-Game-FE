package com.gujeuk.game.match.domain;

import com.gujeuk.game.member.domain.EndReason;

import java.util.Map;

/**
 * 방이 바깥과 이야기하는 통로.
 *
 * 방은 WebSocket도 DB도 모른다. 전송과 저장은 이 인터페이스 뒤로 밀어두었고,
 * 그래서 방의 상태 전이를 소켓 없이도 테스트할 수 있다.
 */
public interface RoomListener {
    void send(Seat seat, Map<String, Object> message);

    void broadcast(Room room, Map<String, Object> message);

    /** 승패가 확정됐을 때 레이팅을 반영하고 변동량을 돌려준다. */
    RatingChange finish(Long winnerId, Long loserId, EndReason reason);

    /** 방을 정리해도 되는 시점에 호출된다. */
    void dispose(Room room);

    /** delaySec 뒤에 task를 실행하고, 취소 가능한 핸들을 돌려준다. */
    Cancellable schedule(Runnable task, int delaySec);

    record RatingChange(int delta, int winnerRating, int loserRating) {
    }

    interface Cancellable {
        void cancel();
    }
}
