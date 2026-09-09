package com.example.springbootapp;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class PasswordMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    public PasswordMigration(JdbcTemplate jdbc, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.passwords = passwords;
    }
    @Override
    @Transactional
    public void run(ApplicationArguments arguments) {
        // The explicit marker avoids confusing a legacy password with an encoded hash.
        var accounts = jdbc.query("SELECT email, password FROM accounts WHERE password_hashed = FALSE",
                (result, row) -> new String[] {result.getString("email"), result.getString("password")});
        for (String[] account : accounts) {
            jdbc.update("UPDATE accounts SET password = ?, password_hashed = TRUE WHERE email = ? AND password_hashed = FALSE",
                    passwords.encode(account[1]), account[0]);
        }
    }
}
