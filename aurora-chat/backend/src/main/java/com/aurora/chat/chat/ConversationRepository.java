package com.aurora.chat.chat;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConversationRepository extends JpaRepository<Conversation, Long> {

    Optional<Conversation> findByDirectKey(String directKey);

    @Query("""
            select c from Conversation c
            where c.id in (select cm.conversation.id from ConversationMember cm where cm.user.id = :userId)
            order by c.updatedAt desc
            """)
    List<Conversation> findAllForUser(@Param("userId") Long userId);
}
