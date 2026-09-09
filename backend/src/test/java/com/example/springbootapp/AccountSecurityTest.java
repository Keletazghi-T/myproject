package com.example.springbootapp;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.http.MediaType.APPLICATION_JSON;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:security-test;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class AccountSecurityTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired DatabaseService database;
    @Autowired PasswordEncoder passwords;
    @Autowired PasswordMigration migration;
    @Autowired ObjectMapper json;
    private static final String PASSWORD = "example-password";

    @BeforeEach
    void reset() {
        jdbc.update("DELETE FROM notifications");
        jdbc.update("DELETE FROM meetings");
        jdbc.update("DELETE FROM comments");
        jdbc.update("DELETE FROM accounts");
        database.saveAccount("Member", "member@example.com", passwords.encode(PASSWORD), "USER");
        database.saveAccount("Admin", "admin@example.com", passwords.encode(PASSWORD), "ADMIN");
    }

    MockHttpSession login(String email) throws Exception {
        MvcResult result = mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", PASSWORD))))
                .andExpect(status().isOk()).andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    @Test
    void registrationNeverGrantsAdminAndHashesPassword() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("name", "New", "email", "new@example.com", "password", PASSWORD, "role", "ADMIN"))))
                .andExpect(status().isCreated());
        var account = database.findAccount("new@example.com").orElseThrow();
        assertThat(account.role()).isEqualTo("USER");
        assertThat(account.password()).isNotEqualTo(PASSWORD);
        assertThat(passwords.matches(PASSWORD, account.password())).isTrue();
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON)
                .content("{\"name\":\"\",\"email\":\"invalid\",\"password\":\"short\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void shortPasswordsAreAcceptedButBlankPasswordsAreRejected() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("name", "Short", "email", "short@example.com", "password", "a"))))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", "short@example.com", "password", "a"))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("name", "Blank", "email", "blank@example.com", "password", " "))))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/auth/account").session(login("member@example.com")).with(csrf()).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("name", "Member", "email", "member@example.com", "password", "b"))))
                .andExpect(status().isOk());
        assertThat(passwords.matches("b", database.findAccount("member@example.com").orElseThrow().password())).isTrue();
    }

    @Test
    void anonymousRequestsAndForgedRolesCannotAccessMembersOrMutations() throws Exception {
        mvc.perform(get("/api/members").header("X-User-Role", "ADMIN")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/auth/account").with(csrf()).contentType(APPLICATION_JSON)
                .content("{\"currentEmail\":\"admin@example.com\",\"name\":\"Attacker\",\"email\":\"admin@example.com\",\"password\":\"new-password\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/auth/account").with(csrf()).header("X-User-Email", "admin@example.com"))
                .andExpect(status().isUnauthorized());
        MockHttpSession member = login("member@example.com");
        mvc.perform(get("/api/members").session(member).header("X-User-Role", "ADMIN"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].email").doesNotExist());
        mvc.perform(delete("/api/comments/1").session(member).with(csrf()).header("X-User-Role", "ADMIN"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/meetings").session(member).with(csrf()).header("X-User-Role", "ADMIN")
                .contentType(APPLICATION_JSON).content(meetingPayload("https://meet.google.com/abc-defg-hij")))
                .andExpect(status().isForbidden());
    }

    @Test
    void csrfTokenEndpointSupportsBrowserFlowAndSessionRotation() throws Exception {
        MvcResult csrfResult = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        MockHttpSession anonymous = (MockHttpSession) csrfResult.getRequest().getSession(false);
        String token = json.readTree(csrfResult.getResponse().getContentAsString()).get("token").asText();
        mvc.perform(post("/api/auth/login").session(anonymous).contentType(APPLICATION_JSON)
                .content("{\"email\":\"member@example.com\",\"password\":\"example-password\"}"))
                .andExpect(status().isForbidden());
        MvcResult result = mvc.perform(post("/api/auth/login").session(anonymous).header("X-CSRF-TOKEN", token)
                .contentType(APPLICATION_JSON).content("{\"email\":\"member@example.com\",\"password\":\"example-password\"}"))
                .andExpect(status().isOk()).andReturn();
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        assertThat(anonymous.isInvalid()).isTrue();
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout").session(session).with(csrf())).andExpect(status().isNoContent());
        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void profileChangesOnlyAffectSignedInAccountAndInvalidateOldCredentials() throws Exception {
        MockHttpSession session = login("member@example.com");
        MockHttpSession secondSession = login("member@example.com");
        MvcResult result = mvc.perform(put("/api/auth/account").session(session).with(csrf()).contentType(APPLICATION_JSON)
                .content("{\"currentEmail\":\"admin@example.com\",\"name\":\"Updated\",\"email\":\"updated@example.com\",\"password\":\"updated-password\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("USER")).andReturn();
        assertThat(database.findAccount("admin@example.com").orElseThrow().name()).isEqualTo("Admin");
        assertThat(database.findAccount("member@example.com")).isEmpty();
        assertThat(passwords.matches("updated-password", database.findAccount("updated@example.com").orElseThrow().password())).isTrue();
        mvc.perform(get("/api/auth/me").session(secondSession)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").session((MockHttpSession) result.getRequest().getSession(false)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value("updated@example.com"));
    }

    @Test
    void failedDatabaseUpdateKeepsOriginalAccount() {
        String hash = database.findAccount("member@example.com").orElseThrow().password();
        assertThatThrownBy(() -> database.updateAccount("member@example.com", "Updated", "admin@example.com", hash, "USER"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(database.findAccount("member@example.com").orElseThrow().name()).isEqualTo("Member");
    }

    @Test
    void deleteIgnoresForgedEmailAndInvalidatesSession() throws Exception {
        MockHttpSession session = login("member@example.com");
        mvc.perform(delete("/api/auth/account").session(session).with(csrf()).header("X-User-Email", "admin@example.com"))
                .andExpect(status().isNoContent());
        assertThat(database.findAccount("member@example.com")).isEmpty();
        assertThat(database.findAccount("admin@example.com")).isPresent();
        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void commentsUseAuthenticatedAuthorAndStableIds() throws Exception {
        MockHttpSession member = login("member@example.com");
        MvcResult result = mvc.perform(post("/api/comments").session(member).with(csrf()).contentType(APPLICATION_JSON)
                .content("{\"author\":\"Admin\",\"text\":\"  First  \"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.author").value("Member"))
                .andExpect(jsonPath("$.text").value("First")).andReturn();
        long first = json.readTree(result.getResponse().getContentAsString()).get("id").asLong();
        long second = database.saveComment(new CommentController.Comment(null, "Member", "Second")).id();
        long third = database.saveComment(new CommentController.Comment(null, "Member", "Third")).id();
        MockHttpSession admin = login("admin@example.com");
        mvc.perform(delete("/api/comments/" + first).session(admin).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(delete("/api/comments/" + second).session(admin).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(delete("/api/comments/" + second).session(admin).with(csrf())).andExpect(status().isNotFound());
        assertThat(database.findComments()).extracting(CommentController.Comment::id).containsExactly(third);
        mvc.perform(post("/api/comments").session(member).with(csrf()).contentType(APPLICATION_JSON).content("{\"text\":\"  \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void repliesAreAuthenticatedValidatedAndDeletedWithParent() throws Exception {
        long parent = database.saveComment(new CommentController.Comment(null, "Admin", "Parent")).id();
        MockHttpSession member = login("member@example.com");
        mvc.perform(post("/api/comments/" + parent + "/replies").with(csrf()).contentType(APPLICATION_JSON).content("{\"text\":\"Reply\"}"))
                .andExpect(status().isUnauthorized());
        MvcResult result = mvc.perform(post("/api/comments/" + parent + "/replies").session(member).with(csrf()).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("text", " Reply ", "author", "Admin"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.author").value("Member"))
                .andExpect(jsonPath("$.parentId").value(parent)).andExpect(jsonPath("$.text").value("Reply")).andReturn();
        long reply = json.readTree(result.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(post("/api/comments/" + parent + "/replies").session(member).with(csrf()).contentType(APPLICATION_JSON).content("{\"text\":\" \"}"))
                .andExpect(status().isBadRequest());
        assertThat(database.findComments()).hasSize(2);
        assertThatThrownBy(() -> database.saveReply(reply, "Member", "Nested")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        database.deleteComment(parent);
        assertThat(database.findComments()).isEmpty();
        mvc.perform(post("/api/comments/" + parent + "/replies").session(member).with(csrf()).contentType(APPLICATION_JSON).content("{\"text\":\"Reply\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void privateMessagesAreLimitedToParticipantsAndSurviveEmailChanges() throws Exception {
        String memberId=database.memberId("member@example.com"), adminId=database.memberId("admin@example.com");
        MockHttpSession member=login("member@example.com"), admin=login("admin@example.com");
        mvc.perform(get("/api/messages/"+memberId)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/messages/"+memberId).session(admin).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("text","Hello")))).andExpect(status().isForbidden());
        mvc.perform(post("/api/messages/"+memberId).session(admin).with(csrf()).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("text"," Hello ","senderId",memberId))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.own").value(true)).andExpect(jsonPath("$.text").value("Hello"));
        mvc.perform(get("/api/messages/"+adminId).session(member)).andExpect(status().isOk())
                .andExpect(jsonPath("$.messages[0].text").value("Hello")).andExpect(jsonPath("$.messages[0].own").value(false));
        database.saveAccount("Third","third@example.com",passwords.encode(PASSWORD),"USER");
        mvc.perform(get("/api/messages/"+memberId).session(login("third@example.com")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.messages").isEmpty());
        var original=database.findAccount("member@example.com").orElseThrow();
        database.updateAccount(original.email(),"Renamed","renamed@example.com",original.password(),original.role());
        assertThat(database.memberId("renamed@example.com")).isEqualTo(memberId);
        mvc.perform(get("/api/messages/"+memberId).session(admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Renamed")).andExpect(jsonPath("$.messages[0].text").value("Hello"));
        database.deleteAccount("renamed@example.com");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM direct_messages",Integer.class)).isZero();
    }

    @Test
    void privateMessagesValidateRecipientAndBody() throws Exception {
        MockHttpSession member=login("member@example.com");
        String self=database.memberId("member@example.com"), target=database.memberId("admin@example.com");
        mvc.perform(post("/api/messages/"+target).session(member).with(csrf()).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("text","  ")))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/messages/"+target).session(member).with(csrf()).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("text","x".repeat(4001))))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/messages/"+self).session(member).with(csrf()).contentType(APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("text","Hello")))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/messages/"+java.util.UUID.randomUUID()).session(member)).andExpect(status().isNotFound());
        mvc.perform(get("/api/members").session(member)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").isNotEmpty()).andExpect(jsonPath("$[0].email").doesNotExist());
    }

    @Test
    void migrationHashesLegacyPasswordsExactlyOnce() {
        String legacyPassword = "legacy-" + "x".repeat(90);
        jdbc.update("INSERT INTO accounts (name, email, password, role) VALUES (?, ?, ?, ?)", "Legacy", "legacy@example.com", legacyPassword, "USER");
        migration.run(new DefaultApplicationArguments());
        String hash = database.findAccount("legacy@example.com").orElseThrow().password();
        assertThat(passwords.matches(legacyPassword, hash)).isTrue();
        migration.run(new DefaultApplicationArguments());
        assertThat(database.findAccount("legacy@example.com").orElseThrow().password()).isEqualTo(hash);
    }

    String meetingPayload(String url) throws Exception {
        return json.writeValueAsString(Map.of("title", "Community", "date", "2026-10-01", "time", "12:00",
                "duration", "1 hour", "platform", "Google Meet", "joinUrl", url));
    }

    @Test
    void meetingLinksAreValidatedAndNotificationsAreSaved() throws Exception {
        MockHttpSession admin = login("admin@example.com");
        mvc.perform(post("/api/meetings").session(admin).with(csrf()).contentType(APPLICATION_JSON)
                .content(meetingPayload("javascript:alert(1)"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/meetings").session(admin).with(csrf()).contentType(APPLICATION_JSON)
                .content(meetingPayload("https://meet.google.com.evil.example/abc"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/meetings").session(admin).with(csrf()).contentType(APPLICATION_JSON)
                .content(meetingPayload("https://meet.google.com/abc-defg-hij")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.joinUrl").value("https://meet.google.com/abc-defg-hij"));
        assertThat(database.findMeetings()).hasSize(1);
        assertThat(database.findNotifications()).hasSize(1);
        assertThat(database.findNotifications().get(0).link()).startsWith("/meeting/");
        mvc.perform(get("/api/meetings/notifications").session(admin)).andExpect(status().isOk());
    }
}
