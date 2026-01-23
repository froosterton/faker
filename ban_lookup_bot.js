const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');

// Load environment variables
require('dotenv').config();

// Tokens for profile changes
const PROFILE_TOKENS = {
  Vic: process.env.VIC_TOKEN,
  Targ: process.env.TARG_TOKEN
};

// Bot token for fetching user info
const BOT_TOKEN = process.env.BOT_TOKEN;

// Guild and channel IDs
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Webhook URLs
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const FAKING_WEBHOOK_URL = process.env.FAKING_WEBHOOK_URL;

// Image URLs per sequence (1–6)
const IMAGE_URLS = [
  process.env.IMAGE_URL_1,
  process.env.IMAGE_URL_2,
  process.env.IMAGE_URL_3,
  process.env.IMAGE_URL_4,
  process.env.IMAGE_URL_5,
  process.env.IMAGE_URL_6
].filter(url => url); // Filter out any undefined values

// X-Super-Properties header (base64 encoded client info to mimic Discord desktop)
const superProperties = Buffer.from(JSON.stringify({
  os: 'Windows',
  browser: 'Discord Client',
  release_channel: 'stable',
  client_version: '1.0.9163',
  os_version: '10.0.19045',
  os_arch: 'x64',
  app_arch: 'x64',
  system_locale: 'en-US',
  browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9163 Chrome/124.0.6367.243 Electron/30.2.0 Safari/537.36',
  browser_version: '30.2.0',
  client_build_number: 327092,
  native_build_number: 54689,
  client_event_source: null
})).toString('base64');

// Create selfbot client using Vic token to listen for commands
const selfbotClient = new Client({ checkUpdate: false });

// Track processed messages to prevent duplicates
const processedMessages = new Set();

// Track current sequence (0-5, where 0 = sequence 1, etc.)
let currentSequenceIndex = 0;

// Function to fetch user info using bot token
async function fetchUserInfo(userId) {
  try {
    const response = await axios.get(`https://discord.com/api/v10/users/${userId}`, {
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      username: response.data.username,
      discriminator: response.data.discriminator,
      avatar: response.data.avatar,
      id: response.data.id,
      global_name: response.data.global_name || response.data.username
    };
  } catch (error) {
    console.error(`Error fetching user info for ${userId}:`, error.response?.data || error.message);
    return null;
  }
}

// Function to get avatar URL
function getAvatarURL(userId, avatarHash) {
  if (!avatarHash) {
    const discriminator = parseInt(userId) % 5;
    return `https://cdn.discordapp.com/embed/avatars/${discriminator}.png`;
  }
  const extension = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${extension}?size=256`;
}

// Function to send message to channel using bot token
async function sendToChannel(channelId, content, embed = null) {
  const headers = {
    'Authorization': `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json'
  };
  
  const payload = {};
  if (content) payload.content = content;
  if (embed) payload.embeds = [embed];
  
  try {
    await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, payload, { headers });
    return true;
  } catch (error) {
    console.error('Error sending to channel:', error.response?.data || error.message);
    return false;
  }
}

// Random delay between messages: 30s, 1min, 2min, or 3min (minimize 3min)
function getRandomDelayMs() {
  const r = Math.random();
  if (r < 0.35) return 30 * 1000;   // 30 sec
  if (r < 0.70) return 60 * 1000;   // 1 min
  if (r < 0.92) return 2 * 60 * 1000; // 2 min
  return 3 * 60 * 1000;             // 3 min (~8%)
}

// Function to get user ID from a token
async function getUserIdFromToken(token) {
  try {
    const response = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });
    return response.data.id;
  } catch (error) {
    console.error('Error getting user ID from token:', error.response?.data || error.message);
    return null;
  }
}

// Function to send a DM from one token to another user
async function sendDM(senderToken, recipientUserId, message, senderName = '') {
  const headers = {
    'Authorization': senderToken,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9163 Chrome/124.0.6367.243 Electron/30.2.0 Safari/537.36',
    'X-Super-Properties': superProperties,
    'X-Discord-Locale': 'en-US',
    'X-Discord-Timezone': 'America/New_York'
  };
  
  try {
    // Create DM channel
    const dmChannelResponse = await axios.post('https://discord.com/api/v9/users/@me/channels', {
      recipient_id: recipientUserId
    }, { headers });
    
    const dmChannelId = dmChannelResponse.data.id;
    
    // Check if message is just an image URL
    const imageUrlPattern = /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|gifv)/i;
    const imageMatch = message.trim().match(imageUrlPattern);
    const isImageUrl = imageMatch && imageMatch[0] === message.trim();
    
    let payload = {};
    
    if (isImageUrl) {
      // Convert media.discordapp.net to cdn.discordapp.com for better embedding
      let imageUrl = message.trim();
      imageUrl = imageUrl.replace('media.discordapp.net', 'cdn.discordapp.com');
      
      // Send image URL both as content and in embed for maximum compatibility
      payload = {
        content: imageUrl,
        embeds: [{
          image: {
            url: imageUrl
          }
        }]
      };
    } else {
      // Regular message
      payload = {
        content: message
      };
    }
    
    // Send message
    await axios.post(`https://discord.com/api/v9/channels/${dmChannelId}/messages`, payload, { headers });
    
    if (senderName) {
      console.log(`✅ [${senderName}] Sent DM: "${message}"`);
    }
    return { success: true, dmChannelId };
  } catch (error) {
    console.error('❌ Error sending DM:', error.response?.data || error.message);
    return { success: false, dmChannelId: null };
  }
}

// Function to get DM channel ID between two users
async function getDMChannelId(token, recipientUserId) {
  const headers = {
    'Authorization': token,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9163 Chrome/124.0.6367.243 Electron/30.2.0 Safari/537.36',
    'X-Super-Properties': superProperties,
    'X-Discord-Locale': 'en-US',
    'X-Discord-Timezone': 'America/New_York'
  };
  
  try {
    const response = await axios.post('https://discord.com/api/v9/users/@me/channels', {
      recipient_id: recipientUserId
    }, { headers });
    return response.data.id;
  } catch (error) {
    console.error('❌ Error getting DM channel:', error.response?.data || error.message);
    return null;
  }
}

// Function to delete all messages in a DM channel
async function deleteAllDMMessages(vicUserId, targUserId) {
  console.log('🗑️ Starting deletion of all DM messages...');
  
  // Get DM channel ID (using Vic token)
  const dmChannelId = await getDMChannelId(PROFILE_TOKENS.Vic, targUserId);
  if (!dmChannelId) {
    console.error('❌ Could not get DM channel ID');
    return false;
  }
  
  let totalDeleted = 0;
  let hasMore = true;
  let beforeMessageId = null;
  
  // Get Vic and Targ user IDs to determine which token to use for deletion
  const vicUserIdFromToken = await getUserIdFromToken(PROFILE_TOKENS.Vic);
  const targUserIdFromToken = await getUserIdFromToken(PROFILE_TOKENS.Targ);
  
  while (hasMore) {
    try {
      // Fetch messages (up to 100 at a time)
      const headers = {
        'Authorization': PROFILE_TOKENS.Vic,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9163 Chrome/124.0.6367.243 Electron/30.2.0 Safari/537.36',
        'X-Super-Properties': superProperties,
        'X-Discord-Locale': 'en-US',
        'X-Discord-Timezone': 'America/New_York'
      };
      
      let url = `https://discord.com/api/v9/channels/${dmChannelId}/messages?limit=100`;
      if (beforeMessageId) {
        url += `&before=${beforeMessageId}`;
      }
      
      const response = await axios.get(url, { headers });
      const messages = response.data;
      
      if (messages.length === 0) {
        hasMore = false;
        break;
      }
      
      // Delete each message using the appropriate token
      for (const message of messages) {
        const messageAuthorId = message.author.id;
        const messageId = message.id;
        
        // Determine which token to use based on who sent the message
        const deleteToken = (messageAuthorId === vicUserIdFromToken) ? PROFILE_TOKENS.Vic : PROFILE_TOKENS.Targ;
        
        const deleteHeaders = {
          'Authorization': deleteToken,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9163 Chrome/124.0.6367.243 Electron/30.2.0 Safari/537.36',
          'X-Super-Properties': superProperties,
          'X-Discord-Locale': 'en-US',
          'X-Discord-Timezone': 'America/New_York'
        };
        
        try {
          await axios.delete(`https://discord.com/api/v9/channels/${dmChannelId}/messages/${messageId}`, {
            headers: deleteHeaders
          });
          totalDeleted++;
          
          // Rate limit handling - wait a bit to avoid hitting limits
          if (totalDeleted % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          // Some messages might not be deletable (too old, etc.)
          if (error.response?.status !== 404 && error.response?.status !== 403) {
            console.error(`⚠️ Error deleting message ${messageId}:`, error.response?.data || error.message);
          }
        }
      }
      
      // Update beforeMessageId for next batch
      beforeMessageId = messages[messages.length - 1].id;
      
      // If we got less than 100 messages, we're done
      if (messages.length < 100) {
        hasMore = false;
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error('❌ Error fetching messages:', error.response?.data || error.message);
      hasMore = false;
    }
  }
  
  console.log(`✅ Deleted ${totalDeleted} messages`);
  return totalDeleted;
}

// Selfbot ready event
selfbotClient.on('ready', () => {
  console.log(`✅ [Vic] Ready: ${selfbotClient.user.tag}`);
  console.log(`📊 Listening for !ban commands in guild: ${GUILD_ID}`);
});

// Use raw events like the original code
selfbotClient.on('raw', async (packet) => {
  // Debug connection events
  if (packet.t === 'READY') {
    console.log('✅ [Vic] Received READY packet from Discord!');
  } else if (packet.t === 'RESUMED') {
    console.log('✅ [Vic] Session resumed');
  }
  
  if (packet.t === 'MESSAGE_CREATE') {
    const data = packet.d;
    
    // Debug: Log all messages to see what we're receiving
    if (data.content && data.content.toLowerCase().includes('ban')) {
      console.log(`🔍 [Debug] Message received - Guild: ${data.guild_id}, Channel: ${data.channel_id}, Content: ${data.content}`);
      console.log(`🔍 [Debug] Expected Guild: ${GUILD_ID}, Expected Channel: ${CHANNEL_ID}`);
    }
    
    // Check guild and channel
    if (data.guild_id !== GUILD_ID) {
      if (data.content && data.content.toLowerCase().includes('ban')) {
        console.log(`⚠️ [Debug] Guild mismatch: ${data.guild_id} !== ${GUILD_ID}`);
      }
      return;
    }
    if (data.channel_id !== CHANNEL_ID) {
      if (data.content && data.content.toLowerCase().includes('ban')) {
        console.log(`⚠️ [Debug] Channel mismatch: ${data.channel_id} !== ${CHANNEL_ID}`);
      }
      return;
    }
    
    const content = data.content?.trim() || '';
    
    // Check for commands
    const lowerContent = content.toLowerCase();
    if (!lowerContent.startsWith('!ban') && !lowerContent.startsWith('!vic') && !lowerContent.startsWith('!targ') && !lowerContent.startsWith('!delete')) return;
    
    // Skip if already processed
    if (processedMessages.has(data.id)) return;
    processedMessages.add(data.id);
    
    // Clean up old messages after 10 seconds
    setTimeout(() => processedMessages.delete(data.id), 10000);
    
    // Handle !vic command
    if (lowerContent === '!vic') {
      console.log(`📨 !vic command detected`);
      await sendToChannel(CHANNEL_ID, PROFILE_TOKENS.Vic);
      return;
    }
    
    // Handle !targ command
    if (lowerContent === '!targ') {
      console.log(`📨 !targ command detected`);
      await sendToChannel(CHANNEL_ID, PROFILE_TOKENS.Targ);
      return;
    }
    
    // Handle !delete command
    if (lowerContent === '!delete') {
      console.log(`📨 !delete command detected`);
      
      // Get user IDs
      const vicUserId = await getUserIdFromToken(PROFILE_TOKENS.Vic);
      const targUserId = await getUserIdFromToken(PROFILE_TOKENS.Targ);
      
      if (!vicUserId || !targUserId) {
        await sendToChannel(CHANNEL_ID, '❌ Could not get user IDs for deletion');
        return;
      }
      
      // Delete all messages
      const deletedCount = await deleteAllDMMessages(vicUserId, targUserId);
      
      // Send green embed when done
      try {
        await axios.post(FAKING_WEBHOOK_URL, {
          embeds: [{
            description: `✅ Successfully deleted ${deletedCount} messages from DMs`,
            color: 0x00ff00 // Green color
          }]
        });
        console.log(`✅ Sent deletion complete embed`);
      } catch (error) {
        console.error('❌ Error sending deletion embed:', error.response?.data || error.message);
      }
      
      return;
    }
    
    // Handle !ban command
    if (!lowerContent.startsWith('!ban')) return;
    
    console.log(`📨 !ban command detected: ${content}`);
    
    // Parse user ID
    const parts = content.split(/\s+/);
    if (parts.length < 2) {
      console.log('⚠️ No user ID provided');
      return;
    }
    
    const userId = parts[1].replace(/[<@!>]/g, '');
    
    // Validate user ID
    if (!/^\d{17,19}$/.test(userId)) {
      console.log(`⚠️ Invalid user ID: ${userId}`);
      return;
    }
    
    console.log(`🔍 Processing !ban for user ID: ${userId}`);
    
    // Fetch user info
    const userInfo = await fetchUserInfo(userId);
    
    if (!userInfo) {
      await sendToChannel(CHANNEL_ID, `❌ Could not fetch user information for ID: ${userId}`);
      return;
    }
    
    const avatarURL = getAvatarURL(userInfo.id, userInfo.avatar);
    const username = userInfo.global_name || userInfo.username;
    
    // Send username and avatar link to channel using bot token
    await sendToChannel(CHANNEL_ID, `**Username:** ${username}\n**Avatar:** ${avatarURL}`);
    console.log(`✅ Sent user info to channel`);
    
    // Get Vic's user ID
    const vicUserId = await getUserIdFromToken(PROFILE_TOKENS.Vic);
    
    if (!vicUserId) {
      console.log('❌ Could not get Vic user ID to send DM');
      return;
    }
    
    // Get Targ's user ID (for Vic to send DMs to Targ)
    const targUserId = await getUserIdFromToken(PROFILE_TOKENS.Targ);
    
    if (!targUserId) {
      console.log('❌ Could not get Targ user ID to send DM');
      return;
    }
    
    // Full dialogue sequences - each message has sender (1 = Targ, 2 = Vic) and content
    const sequences = [
      // Sequence 1 - valk: clean check uaid, rblxtrade better, what is that
      [
        { sender: 1, message: 'hey could i make an offer for valk?' },
        { sender: 2, message: 'sure' },
        { sender: 1, message: 'would you do this? ' + IMAGE_URLS[0] },
        { sender: 2, message: 'i mean you can send it sure' },
        { sender: 1, message: 'okay' },
        { sender: 1, message: 'also the items are clean right?' },
        { sender: 2, message: 'yea just check uaid' },
        { sender: 1, message: 'well have you checked in the rblxtrade server aswell? it\'s better than uaids' },
        { sender: 2, message: 'uh what is that' },
        { sender: 1, message: 'discord.gg/rblxtrade' }
      ],
      // Sequence 2 - sshf: haven't checked, gonna check soon, rblxtrade faster, explain, never heard
      [
        { sender: 1, message: 'yo can i offer for sshf' },
        { sender: 2, message: 'sure what\'s your offer' },
        { sender: 1, message: 'would you do this? ' + IMAGE_URLS[1] },
        { sender: 2, message: 'yeah you can send it' },
        { sender: 1, message: 'alright' },
        { sender: 1, message: 'btw the items are clean right?' },
        { sender: 2, message: 'i haven\'t checked yet tbh' },
        { sender: 1, message: 'oh alright, you gonna check soon?' },
        { sender: 2, message: 'yeah probably, just been busy' },
        { sender: 1, message: 'u could check through rblxtrade, it\'s way faster than uaid' },
        { sender: 2, message: 'rblxtrade? what\'s that' },
        { sender: 1, message: 'it\'s a trading server, they have better tools for checking if stuff\'s clean' },
        { sender: 2, message: 'oh fr? never heard of it' },
        { sender: 1, message: 'yeah it\'s pretty good, discord.gg/rblxtrade' }
      ],
      // Sequence 3 - prank: checked uaid but not sure, rblxtrade to double-check, huh?
      [
        { sender: 1, message: 'r u taking offers for prank' },
        { sender: 2, message: 'yeah send it' },
        { sender: 1, message: 'would you do this? ' + IMAGE_URLS[2] },
        { sender: 2, message: 'lemme look' },
        { sender: 1, message: 'ok' },
        { sender: 1, message: 'items clean btw?' },
        { sender: 2, message: 'i checked uaid but not 100% sure tbh' },
        { sender: 1, message: 'you could double-check on rblxtrade, they\'re more reliable than uaid' },
        { sender: 2, message: 'rblxtrade? huh?' },
        { sender: 1, message: 'trading server for checking clean items, way better' },
        { sender: 2, message: 'never used it' },
        { sender: 1, message: 'discord.gg/rblxtrade' }
      ],
      // Sequence 4 - 8brc: idk u can check, rblxtrade better for that, huh? link
      [
        { sender: 1, message: 'how much u want on 8brc' },
        { sender: 2, message: 'offer' },
        { sender: 1, message: 'would you do this? ' + IMAGE_URLS[3] },
        { sender: 2, message: 'sure send it' },
        { sender: 1, message: 'cool' },
        { sender: 1, message: 'are these clean?' },
        { sender: 2, message: 'idk u can check' },
        { sender: 1, message: 'there\'s rblxtrade, better for that than uaid' },
        { sender: 2, message: 'huh?' },
        { sender: 1, message: 'server for checking if items are clean, way more accurate' },
        { sender: 2, message: 'what\'s it called again' },
        { sender: 1, message: 'rblxtrade, discord.gg/rblxtrade' }
      ],
      // Sequence 5 - bbm: did u check if clean, not yet, rblxtrade has better tools, never heard
      [
        { sender: 1, message: 'are u trading ur bbm' },
        { sender: 2, message: 'yeah' },
        { sender: 1, message: 'what u want for it' },
        { sender: 2, message: 'offer' },
        { sender: 1, message: 'would you do this? ' + IMAGE_URLS[4] },
        { sender: 2, message: 'send it' },
        { sender: 1, message: 'did u check if clean?' },
        { sender: 2, message: 'not yet' },
        { sender: 1, message: 'check rblxtrade they have better tools than uaid' },
        { sender: 2, message: 'never heard of it' },
        { sender: 1, message: 'trading server, good for checking clean items' },
        { sender: 2, message: 'oh alr' },
        { sender: 1, message: 'discord.gg/rblxtrade' }
      ],
      // Sequence 6 - ppp: clean right, yeah check uaid tho, or rblxtrade way better, what's rblxtrade
      [
        { sender: 1, message: 'yo lemme offer on ppp' },
        { sender: 2, message: 'send it' },
        { sender: 1, message: 'would you do this? ' + IMAGE_URLS[5] },
        { sender: 2, message: 'sure' },
        { sender: 1, message: 'btw clean right?' },
        { sender: 2, message: 'yeah check uaid tho' },
        { sender: 1, message: 'or rblxtrade, way better than uaid' },
        { sender: 2, message: 'what\'s rblxtrade' },
        { sender: 1, message: 'server for trading, they check clean stuff better' },
        { sender: 2, message: 'oh okay' },
        { sender: 1, message: 'discord.gg/rblxtrade' }
      ]
    ];
    
    // Only run the current sequence (wait for new !ban command for next sequence)
    if (currentSequenceIndex >= sequences.length) {
      console.log('⚠️ All sequences completed. Resetting to sequence 1.');
      currentSequenceIndex = 0;
    }
    
    const sequenceNumber = currentSequenceIndex + 1;
    const dialogue = sequences[currentSequenceIndex];
    
    console.log(`📨 [Sequence #${sequenceNumber}] Starting dialogue with ${dialogue.length} messages`);
    
    // Send "Convo faking in progress" embed with current sequence
    try {
      await axios.post(FAKING_WEBHOOK_URL, {
        embeds: [{
          description: `🔄 Convo faking in progress - Sequence #${sequenceNumber}`,
          color: 0x3498db // Blue color
        }]
      });
      console.log(`✅ Sent "Convo faking in progress" embed (Sequence #${sequenceNumber})`);
    } catch (error) {
      console.error('❌ Error sending faking embed:', error.response?.data || error.message);
    }
    
    // Send each message in the dialogue
    for (let msgIndex = 0; msgIndex < dialogue.length; msgIndex++) {
      const { sender, message } = dialogue[msgIndex];
      const senderName = sender === 1 ? 'Targ' : 'Vic';
      const senderToken = sender === 1 ? PROFILE_TOKENS.Targ : PROFILE_TOKENS.Vic;
      const recipientId = sender === 1 ? vicUserId : targUserId;
      
      console.log(`📨 [Sequence #${sequenceNumber}] [${senderName}] Sending: "${message}"`);
      
      // Check if message contains an image URL
      const imageUrlPattern = /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|gifv)/i;
      const imageMatch = message.match(imageUrlPattern);
      
      if (imageMatch && message.includes('\n')) {
        // Message has text and image URL on separate lines - send as is
        await sendDM(senderToken, recipientId, message, senderName);
      } else if (imageMatch && message.trim() !== imageMatch[0]) {
        // Message has text before the image URL - split into two messages
        const textPart = message.substring(0, message.indexOf(imageMatch[0])).trim();
        const imageUrl = imageMatch[0];
        
        if (textPart) {
          await sendDM(senderToken, recipientId, textPart, senderName);
          const delayMs = getRandomDelayMs();
          console.log(`⏳ [Sequence #${sequenceNumber}] Waiting ${delayMs / 1000}s before image`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        // Send image URL as separate message for better embedding
        await sendDM(senderToken, recipientId, imageUrl, senderName);
      } else {
        // Regular message or image URL only - send as is
        await sendDM(senderToken, recipientId, message, senderName);
      }
      
      // Random delay before next message (except after the last message of the sequence)
      if (msgIndex < dialogue.length - 1) {
        const delayMs = getRandomDelayMs();
        console.log(`⏳ [Sequence #${sequenceNumber}] Waiting ${delayMs / 1000}s before next message`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    console.log(`✅ [Sequence #${sequenceNumber}] Completed`);
    
    // Notify via embed when sequence has completed
    try {
      await axios.post(FAKING_WEBHOOK_URL, {
        embeds: [{
          description: `✅ Sequence #${sequenceNumber} completed – all messages sent`,
          color: 0x00ff00 // Green
        }]
      });
      console.log(`✅ Sent "Sequence #${sequenceNumber} completed" embed`);
    } catch (error) {
      console.error('❌ Error sending completion embed:', error.response?.data || error.message);
    }
    
    // Increment sequence index for next !ban command
    currentSequenceIndex++;
    
    if (currentSequenceIndex >= sequences.length) {
      console.log('✅ All sequences completed. Next !ban command will restart from sequence 1.');
    } else {
      console.log(`⏳ Waiting for next !ban command to run Sequence #${currentSequenceIndex + 1}`);
    }
  }
});

// Error handling
selfbotClient.on('error', (error) => {
  if (error && error.message && (
    error.message.includes("Cannot read properties of null (reading 'all')") ||
    error.message.includes('ClientUserSettingManager')
  )) {
    return;
  }
  console.error('❌ [Vic] Discord client error:', error.message);
  console.error('Full error:', error);
});

// Debug connection issues
selfbotClient.on('disconnect', () => {
  console.log('⚠️ [Vic] Disconnected from Discord');
});

selfbotClient.on('reconnecting', () => {
  console.log('🔄 [Vic] Reconnecting to Discord...');
});

// Additional connection events
selfbotClient.on('shardReady', (id) => {
  console.log(`✅ [Vic] Shard ${id} ready`);
});

selfbotClient.on('shardDisconnect', (event, id) => {
  console.log(`⚠️ [Vic] Shard ${id} disconnected:`, event);
});

selfbotClient.on('shardReconnecting', (id) => {
  console.log(`🔄 [Vic] Shard ${id} reconnecting...`);
});

selfbotClient.on('shardError', (error, id) => {
  console.error(`❌ [Vic] Shard ${id} error:`, error);
});

console.log('🚀 Starting ban lookup bot...\n');
console.log(`📊 Guild: ${GUILD_ID}`);
console.log(`📊 Channel: ${CHANNEL_ID}`);
console.log(`📊 Profile tokens: ${Object.keys(PROFILE_TOKENS).join(', ')}\n`);

// Test Vic token before login
async function testVicToken() {
  try {
    const response = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: {
        'Authorization': PROFILE_TOKENS.Vic,
        'Content-Type': 'application/json'
      }
    });
    console.log(`✅ [Vic] Token is valid. User: ${response.data.username}#${response.data.discriminator || response.data.id}`);
    return true;
  } catch (error) {
    console.error(`❌ [Vic] Token test failed:`, error.response?.status, error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error('❌ [Vic] Token is INVALID or EXPIRED! Please check the token.');
    }
    return false;
  }
}

// Login selfbot using Vic token to listen for commands
async function startBot() {
  console.log('🔄 Attempting to login Vic...');
  console.log(`Token length: ${PROFILE_TOKENS.Vic.length} characters`);
  
  // Test token first
  const tokenValid = await testVicToken();
  if (!tokenValid) {
    console.error('❌ Cannot proceed - Vic token is invalid');
    return;
  }
  
  try {
    await selfbotClient.login(PROFILE_TOKENS.Vic);
    console.log('✅ Vic login promise resolved');
    
    // Check WebSocket status immediately
    console.log('🔍 [Vic] Checking WebSocket status...');
    console.log('🔍 [Vic] WebSocket exists:', !!selfbotClient.ws);
    console.log('🔍 [Vic] WebSocket status:', selfbotClient.ws?.status);
    console.log('🔍 [Vic] Client user:', selfbotClient.user?.tag || 'Not set yet');
    
    // Check status periodically
    let checkCount = 0;
    const statusCheck = setInterval(() => {
      checkCount++;
      const wsStatus = selfbotClient.ws?.status;
      const hasUser = !!selfbotClient.user;
      
      console.log(`🔍 [Vic] Status check #${checkCount} - WS: ${wsStatus}, User: ${hasUser ? selfbotClient.user.tag : 'None'}`);
      
      if (hasUser) {
        console.log('✅ [Vic] Client is ready!');
        clearInterval(statusCheck);
      } else if (checkCount >= 20) {
        console.log('⚠️ [Vic] Still not ready after 20 checks (20 seconds)');
        console.log('⚠️ [Vic] WebSocket status:', wsStatus);
        console.log('⚠️ [Vic] This might indicate a connection issue.');
        clearInterval(statusCheck);
      }
    }, 1000);
    
  } catch (error) {
    console.error(`❌ [Vic] Failed to login:`, error.message);
    console.error('Full error:', error);
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('❌ [Vic] Token is invalid or expired!');
    }
  }
}

startBot();

process.on('unhandledRejection', (error) => {
  if (error && error.message && (
    error.message.includes("Cannot read properties of null (reading 'all')") ||
    error.message.includes('ClientUserSettingManager')
  )) {
    return;
  }
  console.error('❌ Unhandled promise rejection:', error.message);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  try {
    selfbotClient.destroy();
  } catch (error) {
    // Ignore errors during shutdown
  }
  process.exit(0);
});

console.log('🔔 Waiting for !ban commands...\n');
