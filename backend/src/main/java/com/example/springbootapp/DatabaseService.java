package com.example.springbootapp;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.support.GeneratedKeyHolder;

@Service
public class DatabaseService {

    private final JdbcTemplate jdbc;

    public DatabaseService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean accountExists(String email) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM accounts WHERE email = ?", Integer.class, email) > 0;
    }

    public void saveAccount(String name, String email, String password, String role) {
        jdbc.update("INSERT INTO accounts (name, email, password, role, password_hashed) VALUES (?, ?, ?, ?, TRUE)", name, email, password, role);
    }

    public Optional<AuthController.Account> findAccount(String email) {
        List<AuthController.Account> accounts = jdbc.query(
                "SELECT name, email, password, role FROM accounts WHERE email = ?",
                (result, row) -> new AuthController.Account(result.getString("name"), result.getString("email"),
                        result.getString("password"), result.getString("role")), email);
        return accounts.stream().findFirst();
    }

    public void updateAccount(String currentEmail, String name, String email, String password, String role) {
        int updated = jdbc.update("UPDATE accounts SET name = ?, email = ?, password = ?, role = ?, password_hashed = TRUE WHERE email = ?",
                name, email, password, role, currentEmail);
        if (updated == 0) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Account no longer exists.");
    }

    public boolean deleteAccount(String email) {
        return jdbc.update("DELETE FROM accounts WHERE email = ?", email) > 0;
    }

    public String memberId(String email) {
        return jdbc.queryForObject("SELECT member_id FROM accounts WHERE email = ?", String.class, email);
    }

    public List<MemberController.Member> findMembers() {
        return jdbc.query("SELECT member_id, name, email, role, joined_at FROM accounts ORDER BY name",
                (result, row) -> new MemberController.Member(result.getString("member_id"), result.getString("name"), result.getString("email"), result.getString("role"), false, result.getObject("joined_at", java.time.OffsetDateTime.class)));
    }

    public List<CommentController.Comment> findComments() {
        return jdbc.query("SELECT id, author, text, parent_id FROM comments ORDER BY id",
                (result, row) -> new CommentController.Comment(result.getLong("id"), result.getString("author"), result.getString("text"), result.getObject("parent_id", Long.class)));
    }

    public CommentController.Comment saveComment(CommentController.Comment comment) {
        var keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement = connection.prepareStatement("INSERT INTO comments (author, text, parent_id) VALUES (?, ?, ?)", new String[]{"id"});
            statement.setString(1, comment.author());
            statement.setString(2, comment.text());
            statement.setObject(3, comment.parentId(), java.sql.Types.BIGINT);
            return statement;
        }, keys);
        return new CommentController.Comment(keys.getKey().longValue(), comment.author(), comment.text(), comment.parentId());
    }

    @Transactional
    public CommentController.Comment saveReply(long parentId, String author, String text) {
        // Lock the parent until insertion completes so concurrent deletion cannot orphan a reply.
        var parents = jdbc.query("SELECT id FROM comments WHERE id = ? AND parent_id IS NULL FOR UPDATE",
                (result, row) -> result.getLong("id"), parentId);
        if (parents.isEmpty()) throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.NOT_FOUND, "This comment no longer exists or cannot receive replies.");
        return saveComment(new CommentController.Comment(null, author, text, parentId));
    }

    public boolean deleteComment(long id) {
        return jdbc.update("DELETE FROM comments WHERE id = ?", id) > 0;
    }

    @Transactional
    public MeetingController.Meeting saveMeeting(MeetingController.MeetingRequest request) {
        String id = UUID.randomUUID().toString();
        String link = "/meeting/" + id;
        jdbc.update("INSERT INTO meetings (id, title, meeting_date, meeting_time, duration, platform, link, join_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                id, request.title(), request.date(), request.time(), request.duration(), request.platform(), link, request.joinUrl());
        jdbc.update("INSERT INTO notifications (audience, message, link) VALUES (?, ?, ?)",
                "All members", "New meeting: " + request.title(), link);
        return new MeetingController.Meeting(id, request.title(), request.date(), request.time(), request.duration(), request.platform(), link, request.joinUrl());
    }

    public List<MeetingController.Meeting> findMeetings() {
        return jdbc.query("SELECT * FROM meetings ORDER BY id", (result, row) -> new MeetingController.Meeting(
                result.getString("id"), result.getString("title"), result.getString("meeting_date"),
                result.getString("meeting_time"), result.getString("duration"), result.getString("platform"), result.getString("link"), result.getString("join_url")));
    }

    public MeetingController.Meeting findMeeting(String id) {
        List<MeetingController.Meeting> meetings = jdbc.query("SELECT * FROM meetings WHERE id = ?",
                (result, row) -> new MeetingController.Meeting(result.getString("id"), result.getString("title"),
                        result.getString("meeting_date"), result.getString("meeting_time"), result.getString("duration"),
                        result.getString("platform"), result.getString("link"), result.getString("join_url")), id);
        return meetings.stream().findFirst().orElse(null);
    }

    public List<MeetingController.Notification> findNotifications() {
        return jdbc.query("SELECT audience, message, link FROM notifications ORDER BY id",
                (result, row) -> new MeetingController.Notification(result.getString("audience"), result.getString("message"), result.getString("link").replaceFirst("^https?://[^/]+/meeting/", "/meeting/")));
    }
}