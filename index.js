const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Tickets Bot is alive!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

// الثوابت والآيديات المطلوبة
const CATEGORY_ID = '1535774150277337118';
const SUPPORT_ROLE_ID = '1535774790357614652';
const ADMIN_ROLE_ID = '1535375782736560128';
const BANNER_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1531644529818472458/1535769197286793226/2F8C5A40-B030-4AAE-A84C-975BDB26B9CC.png?ex=6a78f805&is=6a77a685&hm=f64c0b9b99314f73927eb468b1b2ded1b15be82de1a30b069aae62308c2213ce&';
const TARGET_CHANNEL_ID = '1535496283115225208';

// الآيديات الجديدة المضافة
const NO_TICKET_ROLE_ID = '1535843524371808306';
const NO_TICKET_USER_1 = '1531638767352545420';
const NO_TICKET_USER_2 = '1493371500676518000';
const TICKET_LOG_CHANNEL_ID = '1535856331666358413';
const TICKET_ADMIN_SPECIAL_ROLE_ID = '1535856845330194432';

const ticketSummonCooldowns = new Map();
const ticketClaimMap = new Map(); // لتخزين من استلم التكت

async function sendTicketLog(guild, content) {
  try {
    const logChannel = await guild.channels.fetch(TICKET_LOG_CHANNEL_ID).catch(() => null);
    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send({ content: content }).catch(() => {});
    }
  } catch (e) {}
}

client.once('ready', async () => {
  console.log(`Tickets Bot logged in as ${client.user.tag}!`);

  try {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select_menu')
        .setPlaceholder('يرجى اختيار نوع التذكرة')
        .addOptions([
          { label: 'التواصل مع الإدارة', value: 'ticket_management' },
          { label: 'الشكاوي', value: 'ticket_complaints' },
          { label: 'طلب رول', value: 'ticket_roles' },
          { label: 'اخرى', value: 'ticket_other' }
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      const embed = new EmbedBuilder()
        .setImage(BANNER_IMAGE_URL)
        .setColor('#2b2d31');

      const messages = await channel.messages.fetch({ limit: 5 });
      const botMessageExists = messages.some(msg => msg.author.id === client.user.id && msg.components.length > 0);

      if (!botMessageExists) {
        await channel.send({ embeds: [embed], components: [row] });
        console.log('تم إرسال رسالة التذاكر بنجاح في الروم المحدد!');
      }
    }
  } catch (error) {
    console.error('خطأ أثناء محاولة إرسال رسالة التذاكر التلقائية:', error);
  }
});

client.on('messageCreate', async message => {
  if (message.channel.id === TICKET_LOG_CHANNEL_ID && message.author.bot && message.author.id !== client.user.id) {
    await message.delete().catch(() => {});
    return;
  }

  if (message.author.bot) return;

  const contentLower = message.content.toLowerCase().trim();

  // نظام إعطاء نو تكت بكتابة no ticket @منشن أو بالرد على الرسالة
  if (contentLower.startsWith('no ticket')) {
    if (!message.member.roles.cache.has(SUPPORT_ROLE_ID) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    
    let targetMember = message.mentions.members.first();
    if (!targetMember && message.reference) {
      try {
        const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
        if (repliedMsg) {
          targetMember = await message.guild.members.fetch(repliedMsg.author.id).catch(() => null);
        }
      } catch (e) {}
    }

    if (targetMember) {
      try {
        await targetMember.roles.add(NO_TICKET_ROLE_ID);
        await message.react('✅').catch(() => {});

        // البحث عن تكت مفتوح لهذا العضو وإغلاقه فوراً
        const channels = await message.guild.channels.fetch();
        for (const [, channel] of channels) {
          if (channel && channel.parentId === CATEGORY_ID && channel.isTextBased()) {
            let ownerId = null;
            for (const [, entry] of channel.permissionOverwrites.cache) {
              if (entry.type === 1 && entry.id !== message.guild.ownerId) {
                ownerId = entry.id;
                break;
              }
            }
            if (ownerId === targetMember.id) {
              await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { ViewChannel: false });
              await channel.permissionOverwrites.edit(ownerId, { ViewChannel: false });
              await channel.permissionOverwrites.edit(ADMIN_ROLE_ID, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
              await channel.permissionOverwrites.edit(TICKET_ADMIN_SPECIAL_ROLE_ID, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });

              const openRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_open').setLabel('فتح').setStyle(ButtonStyle.Secondary)
              );

              const msgs = await channel.messages.fetch({ limit: 10 });
              const botMsg = msgs.find(m => m.author.id === client.user.id && m.components.length > 0);
              if (botMsg) {
                await botMsg.edit({ components: [openRow] }).catch(() => {});
              }

              await channel.send({ content: `تم إغلاق التذكرة فورياً بسبب إعطاء العضو رول النو تكت.` });
              let claimUserMention = ticketClaimMap.get(channel.id) ? `<@${ticketClaimMap.get(channel.id)}>` : 'محد استلمها';
              await sendTicketLog(message.guild, `في تكت انفتح: <#${channel.id}> لـ <@${ownerId}> | من استلم التكت: ${claimUserMention} | في تكت تقفل: <#${channel.id}> بواستط النظام (نو تكت)`);
            }
          }
        }
      } catch (e) {
        await message.react('❌').catch(() => {});
      }
    } else {
      await message.react('❌').catch(() => {});
    }
    return;
  }

  if (contentLower === 'delete') {
    if (!message.member.roles.cache.has(ADMIN_ROLE_ID) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    try {
      await message.channel.delete();
    } catch (e) {}
    return;
  }

  // إغلاق التذكرة فورياً عند كتابة إغلاق أو اغلاق
  if (contentLower === 'إغلاق' || contentLower === 'اغلاق') {
    if (message.channel.parentId === CATEGORY_ID) {
      try {
        const guild = message.guild;
        const channel = message.channel;
        
        let ownerId = null;
        for (const [, entry] of channel.permissionOverwrites.cache) {
          if (entry.type === 1 && entry.id !== guild.ownerId) {
            ownerId = entry.id;
            break;
          }
        }

        if (message.author.id === ownerId && !message.member.roles.cache.has(SUPPORT_ROLE_ID) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return;
        }

        await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { ViewChannel: false });
        if (ownerId) {
          await channel.permissionOverwrites.edit(ownerId, { ViewChannel: false });
        }

        await channel.permissionOverwrites.edit(ADMIN_ROLE_ID, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        await channel.permissionOverwrites.edit(TICKET_ADMIN_SPECIAL_ROLE_ID, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });

        const openRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_open').setLabel('فتح').setStyle(ButtonStyle.Secondary)
        );

        const messages = await channel.messages.fetch({ limit: 10 });
        const botMsg = messages.find(m => m.author.id === client.user.id && m.components.length > 0);
        if (botMsg) {
          await botMsg.edit({ components: [openRow] }).catch(() => {});
        }

        await message.channel.send({ content: `تم إغلاق التذكرة بواسطة <@${message.author.id}>.` });

        // لوج التكت لإغلاق التذكرة بالشكل المطلوب
        let claimUserMention = ticketClaimMap.get(channel.id) ? `<@${ticketClaimMap.get(channel.id)}>` : 'محد استلمها';
        await sendTicketLog(guild, `في تكت تقفل: <#${channel.id}> لصاحب التكت <@${ownerId || 'unknown'}> | من استلم التكت: ${claimUserMention} | بواسطة: <@${message.author.id}>`);
      } catch (e) {
        console.error(e);
      }
    }
    return;
  }

  if (contentLower === 'setup_ticket') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    
    try {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select_menu')
        .setPlaceholder('يرجى اختيار نوع التذكرة')
        .addOptions([
          { label: 'التواصل مع الإدارة', value: 'ticket_management' },
          { label: 'الشكاوي', value: 'ticket_complaints' },
          { label: 'طلب رول', value: 'ticket_roles' },
          { label: 'اخرى', value: 'ticket_other' }
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      const embed = new EmbedBuilder()
        .setImage(BANNER_IMAGE_URL)
        .setColor('#2b2d31');

      await message.channel.send({ embeds: [embed], components: [row] });
      await message.react('✅').catch(() => {});
    } catch (e) {
      console.error(e);
      await message.react('❌').catch(() => {});
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
    const guild = interaction.guild;
    const member = interaction.member;

    if (member.roles.cache.has(NO_TICKET_ROLE_ID)) {
      await interaction.reply({ 
        content: `عليك نو تكت اذا هذا تبغى ينفك عنك تواصل مع <@${NO_TICKET_USER_1}> و <@${NO_TICKET_USER_2}> وما يمديك تفك تكت`, 
        ephemeral: true 
      });
      const selectMenuClean = new StringSelectMenuBuilder()
        .setCustomId('ticket_select_menu')
        .setPlaceholder('يرجى اختيار نوع التذكرة')
        .addOptions([
          { label: 'التواصل مع الإدارة', value: 'ticket_management' },
          { label: 'الشكاوي', value: 'ticket_complaints' },
          { label: 'طلب رول', value: 'ticket_roles' },
          { label: 'اخرى', value: 'ticket_other' }
        ]);
      await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(selectMenuClean)] }).catch(() => {});
      return;
    }

    const selectedValue = interaction.values[0];

    try {
      const channels = await guild.channels.fetch();
      let hasOpenTicket = false;
      for (const [, channel] of channels) {
        if (channel && channel.parentId === CATEGORY_ID && channel.isTextBased()) {
          let ownerId = null;
          for (const [, entry] of channel.permissionOverwrites.cache) {
            if (entry.type === 1 && entry.id !== guild.ownerId) {
              ownerId = entry.id;
              break;
            }
          }
          if (ownerId === member.id) {
            const supportOverwrite = channel.permissionOverwrites.cache.get(SUPPORT_ROLE_ID);
            const isOpen = !supportOverwrite || supportOverwrite.allow.has(PermissionsBitField.Flags.ViewChannel);
            if (isOpen) {
              hasOpenTicket = true;
              break;
            }
          }
        }
      }

      if (hasOpenTicket) {
        await interaction.reply({ content: 'لديك تذكرة مفتوحة بالفعل، يجب إغلاقها أولاً قبل فتح تذكرة جديدة.', ephemeral: true });
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('ticket_select_menu')
          .setPlaceholder('يرجى اختيار نوع التذكرة')
          .addOptions([
            { label: 'التواصل مع الإدارة', value: 'ticket_management' },
            { label: 'الشكاوي', value: 'ticket_complaints' },
            { label: 'طلب رول', value: 'ticket_roles' },
            { label: 'اخرى', value: 'ticket_other' }
          ]);
        await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(selectMenu)] }).catch(() => {});
        return;
      }
    } catch (e) {
      console.error(e);
    }

    let ticketTypeName = 'أخرى';
    if (selectedValue === 'ticket_management') ticketTypeName = 'التواصل مع الإدارة';
    else if (selectedValue === 'ticket_complaints') ticketTypeName = 'الشكاوي';
    else if (selectedValue === 'ticket_roles') ticketTypeName = 'طلب رول';
    else if (selectedValue === 'ticket_other') ticketTypeName = 'اخرى';

    try {
      await interaction.deferReply({ ephemeral: true });

      const ticketChannel = await guild.channels.create({
        name: `ticket-${member.user.username}`,
        type: 0,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.AttachFiles
            ]
          },
          {
            id: SUPPORT_ROLE_ID,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.ManageMessages
            ]
          },
          {
            id: ADMIN_ROLE_ID,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          {
            id: TICKET_ADMIN_SPECIAL_ROLE_ID,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory
            ],
            deny: [
              PermissionsBitField.Flags.SendMessages
            ]
          }
        ]
      });

      // إرسال لوج فتح التكت
      let claimUserMention = 'محد استلمها';
      await sendTicketLog(guild, `في تكت انفتح: <#${ticketChannel.id}> لصاحب التكت <@${member.id}> | من استلم التكت: ${claimUserMention}`);

      const embed = new EmbedBuilder()
        .setImage(BANNER_IMAGE_URL)
        .setColor('#2b2d31');

      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('اغلاق').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('استلام').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_summon_old').setLabel('اداره').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_summon_member').setLabel('استدعاء').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_add').setLabel('اضافه').setStyle(ButtonStyle.Secondary)
      );

      await ticketChannel.send({
        content: `<@${member.id}> | <@&${SUPPORT_ROLE_ID}>\n\nنوع التذكرة : **${ticketTypeName}**\n\n**اكتب مشكلتك قبل لانجي**`,
        embeds: [embed],
        components: [controlRow]
      });

      const checkInterval = 60000;
      const maxTime = 12 * 60 * 60 * 1000;
      const startTime = Date.now();

      const autoDeleteTimer = setInterval(async () => {
        try {
          const fetchedChannel = await guild.channels.fetch(ticketChannel.id).catch(() => null);
          if (!fetchedChannel) {
            clearInterval(autoDeleteTimer);
            return;
          }

          const messages = await fetchedChannel.messages.fetch({ limit: 20 });
          const ownerHasSpoken = messages.some(m => m.author.id === member.id && !m.author.bot);

          if (ownerHasSpoken) {
            clearInterval(autoDeleteTimer);
            return;
          }

          if (Date.now() - startTime >= maxTime) {
            clearInterval(autoDeleteTimer);
            await fetchedChannel.delete().catch(() => {});
          }
        } catch (e) {
          clearInterval(autoDeleteTimer);
        }
      }, checkInterval);

      const selectMenuClean = new StringSelectMenuBuilder()
        .setCustomId('ticket_select_menu')
        .setPlaceholder('يرجى اختيار نوع التذكرة')
        .addOptions([
          { label: 'التواصل مع الإدارة', value: 'ticket_management' },
          { label: 'الشكاوي', value: 'ticket_complaints' },
          { label: 'طلب رول', value: 'ticket_roles' },
          { label: 'اخرى', value: 'ticket_other' }
        ]);
      await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(selectMenuClean)] }).catch(() => {});

      await interaction.editReply({ content: `تم إنشاء التكت بنجاح: <#${ticketChannel.id}>` });
    } catch (e) {
      console.error(e);
      await interaction.editReply({ content: 'حدث خطأ أثناء إنشاء التكت!' });
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'ticket_add_modal') {
    const userInput = interaction.fields.getTextInputValue('user_input').trim();
    const channel = interaction.channel;
    const member = interaction.member;

    let targetUserId = userInput.replace(/<@!?&?(\d+)>/g, '$1');

    try {
      let userToAdd = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      
      if (!userToAdd) {
        const query = userInput.toLowerCase().replace('@', '');
        const membersList = await interaction.guild.members.fetch();
        userToAdd = membersList.find(m => 
          m.user.username.toLowerCase() === query || 
          m.user.tag.toLowerCase() === query ||
          (m.nickname && m.nickname.toLowerCase() === query)
        );
      }

      if (!userToAdd) {
        await interaction.reply({ content: 'اليوزر غلط', ephemeral: true });
        return;
      }

      await channel.permissionOverwrites.edit(userToAdd.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });

      await interaction.reply({ content: 'تم', ephemeral: true });
      await channel.send({ content: `تمت إضافة العضو <@${userToAdd.id}> إلى التذكرة بواسطة <@${member.id}>.` });
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: 'اليوزر غلط', ephemeral: true });
    }
    return;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;
    const channel = interaction.channel;
    const member = interaction.member;

    const isSupport = member.roles.cache.has(SUPPORT_ROLE_ID) || member.permissions.has(PermissionsBitField.Flags.Administrator);
    const ADMIN_ROLE_ID_VALUE = '1535375782736560128';
    const isAdmin = member.roles.cache.has(ADMIN_ROLE_ID_VALUE) || member.permissions.has(PermissionsBitField.Flags.Administrator);

    let ownerId = null;
    for (const [, entry] of channel.permissionOverwrites.cache) {
      if (entry.type === 1 && entry.id !== interaction.guild.ownerId) {
        ownerId = entry.id;
        break;
      }
    }
    const isOwner = (member.id === ownerId);

    if (customId === 'ticket_close') {
      if (isOwner && !isSupport && !isAdmin) {
        return;
      }

      try {
        await interaction.reply({ content: 'جاري إغلاق التكت...', ephemeral: true });
        
        await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { ViewChannel: false });
        if (ownerId) {
          await channel.permissionOverwrites.edit(ownerId, { ViewChannel: false });
        }
        await channel.permissionOverwrites.edit(ADMIN_ROLE_ID, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        await channel.permissionOverwrites.edit(TICKET_ADMIN_SPECIAL_ROLE_ID, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });

        const openRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_open').setLabel('فتح').setStyle(ButtonStyle.Secondary)
        );

        await interaction.message.edit({ components: [openRow] }).catch(() => {});
        await channel.send({ content: `تم إغلاق التذكرة بواسطة <@${member.id}>.` });

        let claimUserMention = ticketClaimMap.get(channel.id) ? `<@${ticketClaimMap.get(channel.id)}>` : 'محد استلمها';
        await sendTicketLog(interaction.guild, `في تكت تقفل: <#${channel.id}> لصاحب التكت <@${ownerId || 'unknown'}> | من استلم التكت: ${claimUserMention} | بواسطة: <@${member.id}>`);
      } catch (e) {
        console.error(e);
      }
      return;
    }

    if (customId === 'ticket_claim') {
      if (!isSupport) {
        await interaction.reply({ content: `هذا الزر مخصص لـ <@&${SUPPORT_ROLE_ID}>`, ephemeral: true });
        return;
      }

      try {
        await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { ViewChannel: false });
        await channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });
        
        ticketClaimMap.set(channel.id, member.id);

        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('اغلاق').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('استلام').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_summon_old').setLabel('اداره').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_summon_member').setLabel('استدعاء').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_add').setLabel('اضافه').setStyle(ButtonStyle.Secondary)
        );

        await interaction.message.edit({ components: [updatedRow] }).catch(() => {});
        await interaction.reply({ content: 'تم', ephemeral: true });
      } catch (e) {
        console.error(e);
        await interaction.reply({ content: 'حدث خطأ أثناء استلام التكت.', ephemeral: true });
      }
      return;
    }

    if (customId === 'ticket_add') {
      if (!isSupport) {
        await interaction.reply({ content: `هذا الزر مخصص لـ <@&${SUPPORT_ROLE_ID}>`, ephemeral: true });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId('ticket_add_modal')
        .setTitle('إضافة عضو إلى التذكرة');

      const userInputComponent = new TextInputBuilder()
        .setCustomId('user_input')
        .setLabel('أدخل يوزر أو منشن العضو المراد إضافته')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(userInputComponent));
      await interaction.showModal(modal);
      return;
    }

    if (customId === 'ticket_summon_old') {
      const now = Date.now();
      const cooldownTime = 15000;
      const lastSummon = ticketSummonCooldowns.get(member.id + '_old') || 0;

      if (now - lastSummon < cooldownTime) {
        const remainingSeconds = Math.ceil((cooldownTime - (now - lastSummon)) / 1000);
        await interaction.reply({ content: `يرجى الانتظار ${remainingSeconds} ثانية.`, ephemeral: true });
        return;
      }

      ticketSummonCooldowns.set(member.id + '_old', now);

      await interaction.deferReply({ ephemeral: true });
      await interaction.deleteReply().catch(() => {});

      try {
        const pingMsg = await channel.send({ content: `<@&${SUPPORT_ROLE_ID}>` });
        setTimeout(async () => {
          await pingMsg.delete().catch(() => {});
        }, 2000);
      } catch (e) {}

      return;
    }

    if (customId === 'ticket_summon_member') {
      if (!isSupport) {
        await interaction.reply({ content: `هذا الزر مخصص لـ <@&${SUPPORT_ROLE_ID}>`, ephemeral: true });
        return;
      }

      const now = Date.now();
      const cooldownTime = 15 * 60 * 1000;
      const lastSummon = ticketSummonCooldowns.get(channel.id + '_member') || 0;

      if (now - lastSummon < cooldownTime) {
        const remainingMinutes = Math.ceil((cooldownTime - (now - lastSummon)) / 60000);
        await interaction.reply({ content: `يرجى الانتظار ${remainingMinutes} دقيقة قبل استخدام زر استدعاء مرة أخرى.`, ephemeral: true });
        return;
      }

      ticketSummonCooldowns.set(channel.id + '_member', now);

      try {
        if (ownerId) {
          const ownerUser = await client.users.fetch(ownerId).catch(() => null);
          if (ownerUser) {
            await ownerUser.send({ content: `تم استدعاؤك إلى روم التذكرة الخاصة بك: <#${channel.id}> يرجى الدخول والرد بسرعة!` }).catch(() => {});
          }
        }
        await interaction.reply({ content: 'تم إرسال رسالة الاستدعاء في الخاص لصاحب التذكرة بنجاح.', ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: 'تعذر إرسال الرسالة الخاصة لصاحب التذكرة.', ephemeral: true });
      }
      return;
    }

    if (customId === 'ticket_open') {
      if (!member.roles.cache.has(ADMIN_ROLE_ID_VALUE) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: 'صلاحية غير مأذونة!', ephemeral: true });
        return;
      }

      try {
        await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { ViewChannel: true });
        if (ownerId) {
          await channel.permissionOverwrites.edit(ownerId, { ViewChannel: true, SendMessages: true });
        }
        await channel.permissionOverwrites.edit(TICKET_ADMIN_SPECIAL_ROLE_ID, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });

        const normalRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('اغلاق').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('استلام').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_summon_old').setLabel('اداره').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_summon_member').setLabel('استدعاء').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_add').setLabel('اضافه').setStyle(ButtonStyle.Secondary)
        );

        await interaction.message.edit({ components: [normalRow] }).catch(() => {});
        await interaction.reply({ content: 'تم فتح التكت وإظهاره.', ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: 'حدث خطأ أثناء فتح التكت.', ephemeral: true });
      }
      return;
    }
  }
});

client.login(process.env.TOKEN);
