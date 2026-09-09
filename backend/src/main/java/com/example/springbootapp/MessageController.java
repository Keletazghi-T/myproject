package com.example.springbootapp;

import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/messages")
public class MessageController {
    private final CurrentAccount accounts;
    private final DatabaseService database;
    private final JdbcTemplate jdbc;
    public MessageController(CurrentAccount accounts, DatabaseService database, JdbcTemplate jdbc) {
        this.accounts=accounts; this.database=database; this.jdbc=jdbc;
    }
    @GetMapping("/{memberId}")
    public Conversation conversation(@PathVariable UUID memberId, Authentication authentication) {
        String self=database.memberId(accounts.require(authentication).email());
        String name=recipient(memberId, self);
        List<Message> messages=jdbc.query("""
                SELECT id, sender_id, text, created_at FROM direct_messages
                WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
                ORDER BY id DESC LIMIT 100
                """, (row,index)->new Message(row.getLong("id"),row.getString("sender_id").equals(self),
                        row.getString("text"),row.getObject("created_at",java.time.OffsetDateTime.class).toString()),
                UUID.fromString(self),memberId,memberId,UUID.fromString(self));
        Collections.reverse(messages);
        return new Conversation(memberId.toString(),name,messages);
    }
    @PostMapping("/{memberId}")
    public Message send(@PathVariable UUID memberId, @Valid @RequestBody MessageRequest request, Authentication authentication) {
        String self=database.memberId(accounts.require(authentication).email());
        recipient(memberId,self);
        var keys=new GeneratedKeyHolder();
        jdbc.update(connection->{
            var statement=connection.prepareStatement("INSERT INTO direct_messages(sender_id, recipient_id, text) VALUES (?, ?, ?)",new String[]{"id"});
            statement.setObject(1,UUID.fromString(self)); statement.setObject(2,memberId); statement.setString(3,request.text().trim());
            return statement;
        },keys);
        return jdbc.queryForObject("SELECT id, text, created_at FROM direct_messages WHERE id = ?",
                (row,index)->new Message(row.getLong("id"),true,row.getString("text"),row.getObject("created_at",java.time.OffsetDateTime.class).toString()),keys.getKey());
    }
    private String recipient(UUID id,String self) {
        if(id.toString().equals(self)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Choose another member to message.");
        var names=jdbc.query("SELECT name FROM accounts WHERE member_id = ?",(row,index)->row.getString("name"),id);
        if(names.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"This member is no longer available.");
        return names.get(0);
    }
    public record MessageRequest(@NotBlank @Size(max=4000) String text) {}
    public record Message(long id,boolean own,String text,String createdAt) {}
    public record Conversation(String memberId,String name,List<Message> messages) {}
}
