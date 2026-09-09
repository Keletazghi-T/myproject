package com.example.springbootapp;

import java.sql.DriverManager;
import java.util.HashSet;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import static org.assertj.core.api.Assertions.*;

class MemberMigrationTest {
    @Test void existingAccountsReceiveDistinctStableIdsWithoutLosingData() throws Exception {
        try(var connection=DriverManager.getConnection("jdbc:h2:mem:member-migration","sa",""); var sql=connection.createStatement()) {
            sql.execute("CREATE TABLE accounts(email VARCHAR(255) PRIMARY KEY,name VARCHAR(255) NOT NULL,password VARCHAR(255) NOT NULL,role VARCHAR(20) NOT NULL)");
            sql.execute("INSERT INTO accounts VALUES ('a@example.com','Alice','test','USER'),('b@example.com','Bob','test','USER')");
            ScriptUtils.executeSqlScript(connection,new ClassPathResource("schema.sql"));
            try(var rows=sql.executeQuery("SELECT COUNT(*) FROM accounts WHERE joined_at IS NULL")) {
                rows.next(); assertThat(rows.getInt(1)).isEqualTo(2);
            }
            var ids=new HashSet<String>();
            try(var rows=sql.executeQuery("SELECT member_id FROM accounts")) {while(rows.next())ids.add(rows.getString(1));}
            assertThat(ids).hasSize(2).doesNotContainNull();
            ScriptUtils.executeSqlScript(connection,new ClassPathResource("schema.sql"));
            var after=new HashSet<String>();
            try(var rows=sql.executeQuery("SELECT member_id FROM accounts")) {while(rows.next())after.add(rows.getString(1));}
            assertThat(after).isEqualTo(ids);
            sql.execute("INSERT INTO accounts(email,name,password,role) VALUES ('new@example.com','New','test','USER')");
            String joined;
            try(var rows=sql.executeQuery("SELECT joined_at FROM accounts WHERE email = 'new@example.com'")) {
                rows.next(); joined=rows.getString(1); assertThat(joined).isNotNull();
            }
            sql.execute("UPDATE accounts SET email='changed@example.com', name='Changed' WHERE email='new@example.com'");
            ScriptUtils.executeSqlScript(connection,new ClassPathResource("schema.sql"));
            try(var rows=sql.executeQuery("SELECT joined_at FROM accounts WHERE email = 'changed@example.com'")) {
                rows.next(); assertThat(rows.getString(1)).isEqualTo(joined);
            }
        }
    }
}
