import type Database from 'better-sqlite3';
import { invitationIssuerAuthoritySql } from '../rbac/policies';

export function createInvitationRevocationTriggers(db: Database.Database) {
  const timestamp = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
  for (const table of ['board_admin_grants', 'workspace_admin_grants']) {
    for (const operation of ['DELETE', 'UPDATE']) db.exec(`
      CREATE TRIGGER IF NOT EXISTS invitation_${table}_${operation.toLowerCase()}
      AFTER ${operation} ON ${table} BEGIN
        UPDATE board_invitations SET revoked_at = ${timestamp}, revocation_reason = 'issuer_authority_lost'
        WHERE issuer_user_id = OLD.user_id AND revoked_at IS NULL AND NOT ${invitationIssuerAuthoritySql};
      END;
    `);
  }
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS invitation_issuer_account_update
    AFTER UPDATE OF active, platform_role ON users BEGIN
      UPDATE board_invitations SET revoked_at = ${timestamp}, revocation_reason = 'issuer_authority_lost'
      WHERE issuer_user_id = NEW.id AND revoked_at IS NULL AND NOT ${invitationIssuerAuthoritySql};
    END;
    CREATE TRIGGER IF NOT EXISTS invitation_board_move
    AFTER UPDATE OF workspace_id ON boards BEGIN
      UPDATE board_invitations SET revoked_at = ${timestamp}, revocation_reason = 'issuer_authority_lost'
      WHERE board_id = NEW.id AND revoked_at IS NULL AND NOT ${invitationIssuerAuthoritySql};
    END;
    CREATE TRIGGER IF NOT EXISTS invitation_issuer_delete
    BEFORE DELETE ON users BEGIN
      UPDATE board_invitations SET revoked_at = ${timestamp}, revocation_reason = 'issuer_deleted'
      WHERE issuer_user_id = OLD.id AND revoked_at IS NULL;
    END;
    CREATE TRIGGER IF NOT EXISTS invitation_membership_delete
    AFTER DELETE ON board_memberships BEGIN
      UPDATE board_invitations SET revoked_at = ${timestamp}, revocation_reason = 'membership_removed'
      WHERE target_user_id = OLD.user_id AND board_id = OLD.board_id AND accepted_at IS NOT NULL AND revoked_at IS NULL;
    END;
    CREATE TRIGGER IF NOT EXISTS invitation_revocation_audit
    AFTER UPDATE OF revoked_at ON board_invitations WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL BEGIN
      INSERT INTO audit_events (id, actor_user_id, target_user_id, scope_type, scope_id, action, outcome, metadata_json, created_at)
      VALUES (lower(hex(randomblob(16))), NEW.revoked_by_user_id, NEW.target_user_id, 'board', NEW.board_id,
        'board.invitation_revoke', 'success', json_object('invitationId', NEW.id, 'reason', NEW.revocation_reason), NEW.revoked_at);
    END;
  `);
}
