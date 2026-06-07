const { getDatabase } = require('../services/database');

class StatsManager {
    constructor() {
        this.db = null;
    }

    getDb() {
        if (!this.db) {
            this.db = getDatabase();
        }
        return this.db;
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.getDb().run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.getDb().get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.getDb().all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    // ========== COMMAND STATS ==========
    async recordCommand(commandName, chatId, userId, executionTime = 0, status = 'success') {
        try {
            const sql = `
                INSERT INTO command_stats (command_name, chat_id, user_id, execution_time, status, created_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
            `;
            await this.run(sql, [commandName, chatId, userId, executionTime, status]);
        } catch (error) {
            console.error('Error recording command:', error);
        }
    }

    async getCommandStats(commandName = null, limit = 10) {
        try {
            let sql = 'SELECT * FROM command_stats';
            const params = [];
            
            if (commandName) {
                sql += ' WHERE command_name = ?';
                params.push(commandName);
            }
            
            sql += ' ORDER BY created_at DESC LIMIT ?';
            params.push(limit);
            
            return await this.all(sql, params);
        } catch (error) {
            console.error('Error getting command stats:', error);
            return [];
        }
    }

    async getTopCommands(days = 7, limit = 10) {
        try {
            const sql = `
                SELECT 
                    command_name,
                    COUNT(*) as usage_count,
                    ROUND(AVG(execution_time)) as avg_time,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count
                FROM command_stats
                WHERE created_at > datetime('now', ? || ' days')
                GROUP BY command_name
                ORDER BY usage_count DESC
                LIMIT ?
            `;
            return await this.all(sql, [`-${days}`, limit]);
        } catch (error) {
            console.error('Error getting top commands:', error);
            return [];
        }
    }

    async getCommandStats24h() {
        try {
            const result = await this.get(
                `SELECT COUNT(*) as count FROM command_stats WHERE created_at > datetime('now', '-24 hours')`
            );
            return result?.count || 0;
        } catch (error) {
            console.error('Error getting 24h command stats:', error);
            return 0;
        }
    }

    // ========== USER STATS ==========
    async updateUserStats(userId, increment = 1, isCommand = false) {
        try {
            const existing = await this.get('SELECT * FROM user_stats WHERE user_id = ?', [userId]);
            
            if (!existing) {
                const sql = `
                    INSERT INTO user_stats (user_id, total_messages, total_commands, first_seen, last_seen)
                    VALUES (?, ?, ?, datetime('now'), datetime('now'))
                `;
                await this.run(sql, [userId, isCommand ? 0 : increment, isCommand ? increment : 0]);
            } else {
                const sql = `
                    UPDATE user_stats 
                    SET total_messages = total_messages + ?,
                        total_commands = total_commands + ?,
                        last_seen = datetime('now')
                    WHERE user_id = ?
                `;
                await this.run(sql, [isCommand ? 0 : increment, isCommand ? increment : 0, userId]);
            }
        } catch (error) {
            console.error('Error updating user stats:', error);
        }
    }

    async getUserStats(userId) {
        try {
            return await this.get('SELECT * FROM user_stats WHERE user_id = ?', [userId]);
        } catch (error) {
            console.error('Error getting user stats:', error);
            return null;
        }
    }

    async getTopUsers(limit = 10) {
        try {
            return await this.all(
                `SELECT * FROM user_stats ORDER BY total_commands DESC LIMIT ?`,
                [limit]
            );
        } catch (error) {
            console.error('Error getting top users:', error);
            return [];
        }
    }

    async getTotalUsers() {
        try {
            const result = await this.get('SELECT COUNT(*) as count FROM user_stats');
            return result?.count || 0;
        } catch (error) {
            console.error('Error getting total users:', error);
            return 0;
        }
    }

    // ========== CHAT STATS ==========
    async updateChatStats(chatId, chatName = null, messageIncrement = 0, commandIncrement = 0, memberCount = null) {
        try {
            const existing = await this.get('SELECT * FROM chat_stats WHERE chat_id = ?', [chatId]);
            
            if (!existing) {
                const sql = `
                    INSERT INTO chat_stats (chat_id, chat_name, total_messages, total_commands, members_count, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                `;
                await this.run(sql, [chatId, chatName || 'Unknown', messageIncrement, commandIncrement, memberCount || 0]);
            } else {
                const sql = `
                    UPDATE chat_stats 
                    SET total_messages = total_messages + ?,
                        total_commands = total_commands + ?,
                        chat_name = COALESCE(?, chat_name),
                        members_count = COALESCE(?, members_count),
                        updated_at = datetime('now')
                    WHERE chat_id = ?
                `;
                await this.run(sql, [messageIncrement, commandIncrement, chatName, memberCount, chatId]);
            }
        } catch (error) {
            console.error('Error updating chat stats:', error);
        }
    }

    async getChatStats(chatId) {
        try {
            return await this.get('SELECT * FROM chat_stats WHERE chat_id = ?', [chatId]);
        } catch (error) {
            console.error('Error getting chat stats:', error);
            return null;
        }
    }

    async getTopChats(limit = 10) {
        try {
            return await this.all(
                `SELECT * FROM chat_stats ORDER BY total_commands DESC LIMIT ?`,
                [limit]
            );
        } catch (error) {
            console.error('Error getting top chats:', error);
            return [];
        }
    }

    async getTotalChats() {
        try {
            const result = await this.get('SELECT COUNT(*) as count FROM chat_stats');
            return result?.count || 0;
        } catch (error) {
            console.error('Error getting total chats:', error);
            return 0;
        }
    }

    // ========== BOT PERFORMANCE ==========
    async recordPerformance(memoryUsage, cpuUsage, responseTime, uptimeSeconds, totalCommandsExecuted) {
        try {
            const sql = `
                INSERT INTO bot_performance (memory_usage, cpu_usage, response_time, uptime_seconds, total_commands_executed, timestamp)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
            `;
            await this.run(sql, [memoryUsage, cpuUsage, responseTime, uptimeSeconds, totalCommandsExecuted]);
        } catch (error) {
            console.error('Error recording performance:', error);
        }
    }

    async getPerformanceHistory(hours = 24) {
        try {
            return await this.all(
                `SELECT * FROM bot_performance
                 WHERE timestamp > datetime('now', ? || ' hours')
                 ORDER BY timestamp DESC
                 LIMIT 288`,
                [`-${hours}`]
            );
        } catch (error) {
            console.error('Error getting performance history:', error);
            return [];
        }
    }

    async getAverageMetrics(hours = 24) {
        try {
            return await this.get(
                `SELECT 
                    ROUND(AVG(memory_usage)) as avg_memory,
                    ROUND(AVG(cpu_usage), 2) as avg_cpu,
                    ROUND(AVG(response_time)) as avg_response_time,
                    MAX(uptime_seconds) as max_uptime
                 FROM bot_performance
                 WHERE timestamp > datetime('now', ? || ' hours')`,
                [`-${hours}`]
            );
        } catch (error) {
            console.error('Error getting average metrics:', error);
            return null;
        }
    }

    // ========== DAILY STATS ==========
    async recordDailyStats() {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const commandsResult = await this.get(
                `SELECT COUNT(*) as count FROM command_stats WHERE DATE(created_at) = ?`,
                [today]
            );
            const commandsToday = commandsResult?.count || 0;

            const usersResult = await this.get(
                `SELECT COUNT(DISTINCT user_id) as count FROM command_stats WHERE DATE(created_at) = ?`,
                [today]
            );
            const uniqueUsers = usersResult?.count || 0;

            const chatsResult = await this.get(
                `SELECT COUNT(DISTINCT chat_id) as count FROM command_stats WHERE DATE(created_at) = ?`,
                [today]
            );
            const uniqueChats = chatsResult?.count || 0;

            const errorsResult = await this.get(
                `SELECT COUNT(*) as count FROM command_stats WHERE DATE(created_at) = ? AND status = 'error'`,
                [today]
            );
            const errors = errorsResult?.count || 0;

            const avgTimeResult = await this.get(
                `SELECT ROUND(AVG(execution_time)) as avg FROM command_stats WHERE DATE(created_at) = ?`,
                [today]
            );
            const avgTime = avgTimeResult?.avg || 0;

            const existing = await this.get('SELECT * FROM daily_stats WHERE stat_date = ?', [today]);
            
            if (!existing) {
                const sql = `
                    INSERT INTO daily_stats (stat_date, total_commands, unique_users, unique_chats, error_count, average_response_time)
                    VALUES (?, ?, ?, ?, ?, ?)
                `;
                await this.run(sql, [today, commandsToday, uniqueUsers, uniqueChats, errors, avgTime]);
            }

            return { commandsToday, uniqueUsers, uniqueChats, errors, avgTime };
        } catch (error) {
            console.error('Error recording daily stats:', error);
            return {};
        }
    }

    async getDailyStats(days = 30) {
        try {
            return await this.all(
                `SELECT * FROM daily_stats
                 WHERE stat_date >= DATE('now', ? || ' days')
                 ORDER BY stat_date DESC`,
                [`-${days}`]
            );
        } catch (error) {
            console.error('Error getting daily stats:', error);
            return [];
        }
    }

    // ========== GENERAL STATS ==========
    async getAllStats() {
        try {
            const totalCommands = await this.get('SELECT COUNT(*) as count FROM command_stats');
            const totalUsers = await this.getTotalUsers();
            const totalChats = await this.getTotalChats();
            const topCommands = await this.getTopCommands(7, 5);
            const topUsers = await this.getTopUsers(5);
            const topChats = await this.getTopChats(5);
            const commands24h = await this.getCommandStats24h();
            const avgMetrics = await this.getAverageMetrics(24);

            return {
                totalCommands: totalCommands?.count || 0,
                totalUsers,
                totalChats,
                commands24h,
                topCommands,
                topUsers,
                topChats,
                avgMetrics
            };
        } catch (error) {
            console.error('Error getting all stats:', error);
            return {
                totalCommands: 0,
                totalUsers: 0,
                totalChats: 0,
                commands24h: 0,
                topCommands: [],
                topUsers: [],
                topChats: [],
                avgMetrics: null
            };
        }
    }

    async clearOldData(daysToKeep = 90) {
        try {
            const sql1 = `DELETE FROM command_stats WHERE created_at < datetime('now', ? || ' days')`;
            const sql2 = `DELETE FROM bot_performance WHERE timestamp < datetime('now', ? || ' days')`;
            
            await this.run(sql1, [`-${daysToKeep}`]);
            await this.run(sql2, [`-${daysToKeep}`]);
        } catch (error) {
            console.error('Error clearing old data:', error);
        }
    }

    // ========== USER MANAGEMENT (BAN/MUTE/WARN) ==========
    async banUser(userId, chatId, reason = '', bannedBy = '', isGlobal = false) {
        try {
            const sql = `
                INSERT OR REPLACE INTO banned_users (user_id, chat_id, reason, banned_by, is_global, banned_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
            `;
            await this.run(sql, [userId, chatId, reason, bannedBy, isGlobal ? 1 : 0]);
            return true;
        } catch (error) {
            console.error('Error banning user:', error);
            return false;
        }
    }

    async unbanUser(userId, chatId) {
        try {
            const sql = `DELETE FROM banned_users WHERE user_id = ? AND chat_id = ?`;
            await this.run(sql, [userId, chatId]);
            return true;
        } catch (error) {
            console.error('Error unbanning user:', error);
            return false;
        }
    }

    async isBanned(userId, chatId) {
        try {
            const result = await this.get(
                `SELECT * FROM banned_users WHERE user_id = ? AND (chat_id = ? OR is_global = 1)`,
                [userId, chatId]
            );
            return !!result;
        } catch (error) {
            console.error('Error checking ban status:', error);
            return false;
        }
    }

    async getBannedUsers(chatId, isGlobal = false) {
        try {
            const sql = isGlobal 
                ? `SELECT * FROM banned_users WHERE is_global = 1 ORDER BY banned_at DESC`
                : `SELECT * FROM banned_users WHERE chat_id = ? ORDER BY banned_at DESC`;
            return await this.all(sql, isGlobal ? [] : [chatId]);
        } catch (error) {
            console.error('Error getting banned users:', error);
            return [];
        }
    }

    async muteUser(userId, chatId, durationMinutes = null, reason = '', mutedBy = '') {
        try {
            const sql = `
                INSERT OR REPLACE INTO muted_users (user_id, chat_id, duration_minutes, reason, muted_by, muted_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
            `;
            await this.run(sql, [userId, chatId, durationMinutes, reason, mutedBy]);
            return true;
        } catch (error) {
            console.error('Error muting user:', error);
            return false;
        }
    }

    async unmuteUser(userId, chatId) {
        try {
            const sql = `DELETE FROM muted_users WHERE user_id = ? AND chat_id = ?`;
            await this.run(sql, [userId, chatId]);
            return true;
        } catch (error) {
            console.error('Error unmuting user:', error);
            return false;
        }
    }

    async isMuted(userId, chatId) {
        try {
            const result = await this.get(
                `SELECT * FROM muted_users WHERE user_id = ? AND chat_id = ?`,
                [userId, chatId]
            );
            if (!result) return false;
            
            // Check if mute duration has expired
            if (result.duration_minutes) {
                const mutedTime = new Date(result.muted_at);
                const now = new Date();
                const minutesElapsed = (now - mutedTime) / (1000 * 60);
                if (minutesElapsed > result.duration_minutes) {
                    await this.unmuteUser(userId, chatId);
                    return false;
                }
            }
            return true;
        } catch (error) {
            console.error('Error checking mute status:', error);
            return false;
        }
    }

    async getMutedUsers(chatId) {
        try {
            return await this.all(
                `SELECT * FROM muted_users WHERE chat_id = ? ORDER BY muted_at DESC`,
                [chatId]
            );
        } catch (error) {
            console.error('Error getting muted users:', error);
            return [];
        }
    }

    async warnUser(userId, chatId, reason = '', warnedBy = '') {
        try {
            const existing = await this.get(
                `SELECT * FROM user_warns WHERE user_id = ? AND chat_id = ?`,
                [userId, chatId]
            );

            if (existing) {
                const sql = `UPDATE user_warns SET warn_count = warn_count + 1, warned_at = datetime('now') WHERE user_id = ? AND chat_id = ?`;
                await this.run(sql, [userId, chatId]);
            } else {
                const sql = `
                    INSERT INTO user_warns (user_id, chat_id, reason, warned_by, warn_count, warned_at)
                    VALUES (?, ?, ?, ?, 1, datetime('now'))
                `;
                await this.run(sql, [userId, chatId, reason, warnedBy]);
            }
            return true;
        } catch (error) {
            console.error('Error warning user:', error);
            return false;
        }
    }

    async getWarnings(userId, chatId) {
        try {
            return await this.get(
                `SELECT * FROM user_warns WHERE user_id = ? AND chat_id = ?`,
                [userId, chatId]
            );
        } catch (error) {
            console.error('Error getting warnings:', error);
            return null;
        }
    }

    async removeWarnings(userId, chatId) {
        try {
            const sql = `DELETE FROM user_warns WHERE user_id = ? AND chat_id = ?`;
            await this.run(sql, [userId, chatId]);
            return true;
        } catch (error) {
            console.error('Error removing warnings:', error);
            return false;
        }
    }

    // ========== ADVANCED QUERIES & EXPORT ==========
    async queryCommandsByDateRange(startDate, endDate, limit = 100) {
        try {
            return await this.all(
                `SELECT * FROM command_stats 
                 WHERE DATE(created_at) BETWEEN ? AND ?
                 ORDER BY created_at DESC
                 LIMIT ?`,
                [startDate, endDate, limit]
            );
        } catch (error) {
            console.error('Error querying commands by date:', error);
            return [];
        }
    }

    async queryUserActivity(userId, days = 30) {
        try {
            return await this.all(
                `SELECT command_name, COUNT(*) as count, AVG(execution_time) as avg_time
                 FROM command_stats
                 WHERE user_id = ? AND created_at > datetime('now', ? || ' days')
                 GROUP BY command_name
                 ORDER BY count DESC`,
                [userId, `-${days}`]
            );
        } catch (error) {
            console.error('Error querying user activity:', error);
            return [];
        }
    }

    async queryChatActivity(chatId, days = 30) {
        try {
            return await this.all(
                `SELECT command_name, COUNT(*) as count, COUNT(DISTINCT user_id) as unique_users
                 FROM command_stats
                 WHERE chat_id = ? AND created_at > datetime('now', ? || ' days')
                 GROUP BY command_name
                 ORDER BY count DESC`,
                [chatId, `-${days}`]
            );
        } catch (error) {
            console.error('Error querying chat activity:', error);
            return [];
        }
    }

    async getCommandStats(commandName = null, days = 7, limit = 100) {
        try {
            let sql = `
                SELECT command_name, COUNT(*) as usage_count, 
                       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                       ROUND(AVG(execution_time)) as avg_time
                FROM command_stats
                WHERE created_at > datetime('now', ? || ' days')
            `;
            const params = [`-${days}`];

            if (commandName) {
                sql += ` AND command_name = ?`;
                params.push(commandName);
            }

            sql += ` GROUP BY command_name ORDER BY usage_count DESC LIMIT ?`;
            params.push(limit);

            return await this.all(sql, params);
        } catch (error) {
            console.error('Error getting command stats:', error);
            return [];
        }
    }

    async getErrorStats(days = 7) {
        try {
            return await this.all(
                `SELECT command_name, COUNT(*) as error_count, 
                        GROUP_CONCAT(DISTINCT user_id) as users_affected
                 FROM command_stats
                 WHERE status = 'error' AND created_at > datetime('now', ? || ' days')
                 GROUP BY command_name
                 ORDER BY error_count DESC`,
                [`-${days}`]
            );
        } catch (error) {
            console.error('Error getting error stats:', error);
            return [];
        }
    }

    // Export data as JSON
    async exportStatsJSON(format = 'all', days = 30) {
        try {
            const exports = {};

            if (format === 'all' || format === 'commands') {
                exports.commands = await this.queryCommandsByDateRange(
                    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    new Date().toISOString().split('T')[0],
                    1000
                );
            }

            if (format === 'all' || format === 'users') {
                exports.topUsers = await this.getTopUsers(100);
            }

            if (format === 'all' || format === 'chats') {
                exports.topChats = await this.getTopChats(100);
            }

            if (format === 'all' || format === 'daily') {
                exports.dailyStats = await this.getDailyStats(days);
            }

            if (format === 'all' || format === 'errors') {
                exports.errors = await this.getErrorStats(days);
            }

            return exports;
        } catch (error) {
            console.error('Error exporting stats:', error);
            return {};
        }
    }

    // Export data as CSV
    async exportStatsCSV(format = 'commands', days = 30) {
        try {
            let data = [];
            let headers = [];

            if (format === 'commands') {
                data = await this.queryCommandsByDateRange(
                    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    new Date().toISOString().split('T')[0],
                    10000
                );
                headers = ['command_name', 'chat_id', 'user_id', 'execution_time', 'status', 'created_at'];
            } else if (format === 'users') {
                data = await this.all('SELECT * FROM user_stats LIMIT 1000');
                headers = ['user_id', 'total_messages', 'total_commands', 'first_seen', 'last_seen'];
            } else if (format === 'chats') {
                data = await this.all('SELECT * FROM chat_stats LIMIT 1000');
                headers = ['chat_id', 'chat_name', 'total_messages', 'total_commands', 'members_count'];
            }

            if (data.length === 0) return '';

            // Build CSV
            let csv = headers.join(',') + '\n';
            data.forEach(row => {
                const values = headers.map(h => {
                    const val = row[h];
                    return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
                });
                csv += values.join(',') + '\n';
            });

            return csv;
        } catch (error) {
            console.error('Error exporting CSV:', error);
            return '';
        }
    }
}

module.exports = new StatsManager();
