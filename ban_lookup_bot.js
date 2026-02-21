const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

function getAvatarURL(user) {
  if (!user.avatar) {
    const index = (BigInt(user.id) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=1024`;
}

function getBannerURL(user) {
  if (!user.banner) return null;
  const ext = user.banner.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=1024`;
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (GUILD_ID && message.guild?.id !== GUILD_ID) return;
  if (CHANNEL_ID && message.channel.id !== CHANNEL_ID) return;

  const content = message.content.trim().toLowerCase();
  if (!content.startsWith('!get')) return;

  const parts = message.content.trim().split(/\s+/);
  if (parts.length < 2) {
    return message.reply('Usage: `!get <user_id>`');
  }

  const userId = parts[1].replace(/[<@!>]/g, '');

  if (!/^\d{17,19}$/.test(userId)) {
    return message.reply(`Invalid user ID: \`${userId}\``);
  }

  try {
    // force: true fetches the full profile including banner
    const user = await client.users.fetch(userId, { force: true });

    const avatarURL = getAvatarURL(user);
    const bannerURL = getBannerURL(user);
    const displayName = user.globalName || user.username;

    const embed = new EmbedBuilder()
      .setTitle(displayName)
      .setDescription(`**Username:** ${user.username}\n**ID:** ${user.id}`)
      .setThumbnail(avatarURL)
      .setColor(user.accentColor || 0x5865f2);

    if (bannerURL) {
      embed.setImage(bannerURL);
    } else {
      embed.addFields({ name: 'Banner', value: 'No banner set', inline: true });
    }

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error(`Error fetching user ${userId}:`, error.message);
    await message.reply(`Could not fetch user info for ID: \`${userId}\``);
  }
});

client.login(BOT_TOKEN);
