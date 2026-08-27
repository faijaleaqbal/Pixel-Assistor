// test/permsHierarchy.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  canManageMember,
  canManageRole,
  checkBotPermissions,
  hasPermission,
  isOwner,
  isGuildOwner,
  isTrustedOwner,
  getTrustedOwners,
} = require('../utils/perms');

describe('Permission & Role Hierarchy Validation Engine', () => {
  const guild = {
    id: 'guild_1',
    ownerId: 'owner_user_id',
    members: {
      me: {
        id: 'bot_user_id',
        roles: { highest: { position: 80 } },
        permissions: { has: (p) => p === 8n || p === 'Administrator' },
      },
    },
  };

  const botUser = { id: 'bot_user_id', tag: 'Pixel#0001' };

  it('canManageMember: blocks acting on server owner', () => {
    const actor = {
      id: 'admin_user_id',
      guild,
      roles: { highest: { position: 90 } },
      client: { user: botUser },
    };
    const target = {
      id: 'owner_user_id',
      guild,
      roles: { highest: { position: 10 } },
    };

    const res = canManageMember(actor, target, guild, { actionName: 'ban' });
    assert.equal(res.ok, false);
    assert.match(res.error, /cannot ban the server owner/);
  });

  it('canManageMember: blocks acting on self unless allowed', () => {
    const actor = {
      id: 'actor_user_id',
      guild,
      roles: { highest: { position: 50 } },
      client: { user: botUser },
    };
    const target = {
      id: 'actor_user_id',
      guild,
      roles: { highest: { position: 50 } },
    };

    const blocked = canManageMember(actor, target, guild, { allowSelf: false, actionName: 'kick' });
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /cannot kick yourself/);

    const allowed = canManageMember(actor, target, guild, { allowSelf: true, actionName: 'afk' });
    assert.equal(allowed.ok, true);
  });

  it('canManageMember: blocks acting on the bot itself', () => {
    const actor = {
      id: 'actor_user_id',
      guild,
      roles: { highest: { position: 99 } },
      client: { user: botUser },
    };
    const target = {
      id: 'bot_user_id',
      guild,
      roles: { highest: { position: 80 } },
    };

    const res = canManageMember(actor, target, guild, { allowBot: false, actionName: 'mute' });
    assert.equal(res.ok, false);
    assert.match(res.error, /I cannot mute myself/);
  });

  it('canManageMember: blocks acting on equal or higher role members', () => {
    const actor = {
      id: 'mod_user_id',
      guild,
      roles: { highest: { position: 50 } },
      client: { user: botUser },
    };
    const targetEqual = {
      id: 'target_equal',
      guild,
      roles: { highest: { position: 50 } },
    };
    const targetHigher = {
      id: 'target_higher',
      guild,
      roles: { highest: { position: 60 } },
    };
    const targetLower = {
      id: 'target_lower',
      guild,
      roles: { highest: { position: 40 } },
    };

    assert.equal(canManageMember(actor, targetEqual, guild).ok, false);
    assert.equal(canManageMember(actor, targetHigher, guild).ok, false);
    assert.equal(canManageMember(actor, targetLower, guild).ok, true);
  });

  it('canManageMember: allows guild owner to act on any member', () => {
    const ownerActor = {
      id: 'owner_user_id',
      guild,
      roles: { highest: { position: 10 } },
      client: { user: botUser },
    };
    const target = {
      id: 'admin_user_id',
      guild,
      roles: { highest: { position: 90 } },
    };

    assert.equal(canManageMember(ownerActor, target, guild, { checkBot: false }).ok, true);
  });

  it('canManageRole: blocks @everyone, managed roles, and higher-position roles', () => {
    const actor = {
      id: 'admin_user_id',
      guild,
      roles: { highest: { position: 50 } },
      client: { user: botUser },
    };

    // @everyone
    assert.equal(canManageRole(actor, { id: 'guild_1', position: 0 }, guild).ok, false);

    // Managed bot role
    assert.equal(canManageRole(actor, { id: 'role_bot', managed: true, position: 20 }, guild).ok, false);

    // Role equal or higher than actor
    assert.equal(canManageRole(actor, { id: 'role_high', position: 50 }, guild).ok, false);
    assert.equal(canManageRole(actor, { id: 'role_super', position: 70 }, guild).ok, false);

    // Valid lower role
    assert.equal(canManageRole(actor, { id: 'role_low', position: 30 }, guild).ok, true);
  });

  it('checkBotPermissions: accurately assesses required permissions', () => {
    const channelWithSend = {
      permissionsFor: () => ({
        has: (flag) => flag === 'SendMessages' || flag === 2048n,
      }),
    };
    const channelWithoutSend = {
      permissionsFor: () => ({
        has: () => false,
      }),
    };

    const check1 = checkBotPermissions({ guild, channel: channelWithSend }, ['SendMessages']);
    assert.equal(check1.ok, true);

    const check2 = checkBotPermissions({ guild, channel: channelWithoutSend }, ['SendMessages', 'EmbedLinks']);
    assert.equal(check2.ok, false);
    assert.ok(check2.missing.includes('SendMessages'));
  });

  it('isOwner & isGuildOwner accurately identify ownership', async () => {
    assert.equal(isGuildOwner({ id: 'owner_user_id' }, guild), true);
    assert.equal(isGuildOwner({ id: 'random_user_id' }, guild), false);
    assert.equal(isOwner('some_random_id'), false);

    const adminMember = { permissions: { has: () => true } };
    assert.equal(hasPermission(adminMember, 'Administrator'), true);

    const trustedOwner = await isTrustedOwner('owner_user_id', guild);
    assert.equal(trustedOwner, true);

    const untrusted = await isTrustedOwner('random_user_id', guild);
    assert.equal(untrusted, false);

    const ownersInfo = await getTrustedOwners(guild);
    assert.equal(ownersInfo.guildOwnerId, 'owner_user_id');
  });
});
