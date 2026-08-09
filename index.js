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
  StringSelectMenuBuilder
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
const BANNER_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1531644529818472458/1535769197286793226/2F8C5A40-B030-4AAE-A84C-975BDB26B9CC.png?ex=6a78f805&is=6a77a685&hm=f64c0b9b99314f73927eb468b1b2ded1b15be82de1a30b069aae62308c2213ce&';
const TARGET_CHANNEL_ID = '1535496283115225208';

// لتتبع فترات الانتظار الخاصة بأمر "استدعاء" (كل 15 ثانية لكل مستخدم)
const summonCooldowns = new Map();

client.once('ready', async () => {
  console.log(`Tickets Bot logged in as ${client.user.tag}!`);

  // إرسال قائمة التذاكر تلقائياً في الروم المحدد عند اشتغال البوت
  try {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select_menu')
        .setPlaceholder('يرجى اختيار نوع التذكرة')
        .addOptions([
          { label: 'التواصل مع الإدارة', value: 'ticket_management', description: 'التواصل المباشر مع إدارة السيرفر' },
          { label: 'الشكاوي', value: 'ticket_complaints', description: 'تقديم شكوى رسمية' },
          { label: 'طلب رول', value: 'ticket_roles', description: 'طلب الحصول على رولات معينة' },
          { label: 'اخرى', value: 'ticket_other', description: 'استفسارات أخرى عامة' }
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      const embed = new EmbedBuilder()
        .setImage(BANNER_IMAGE_URL)
        .setColor('#2b2d31');

      // التحقق من عدم تكرار إرسال الرسالة إذا كانت موجودة مسبقاً لتجنب سبام الرسائل عند إعادة تشغيل البوت
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

// أمر إرسال القائمة المنسدلة يدويًا عبر كتابة setup_ticket
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const contentLower = message.content.toLowerCase().trim();

  if (contentLower === 'setup_ticket') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    
    try {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select_menu')
        .setPlaceholder('يرجى اختيار نوع التذكرة')
        .addOptions([
          { label: 'التواصل مع الإدارة', value: 'ticket_management', description: 'التواصل المباشر مع إدارة السيرفر' },
          { label: 'الشكاوي', value: 'ticket_complaints', description: 'تقديم شكوى رسمية' },
          { label: 'طلب رول', value: 'ticket_roles', description: 'طلب الحصول على رولات معينة' },
          { label: 'اخرى', value: 'ticket_other', description: 'استفسارات أخرى عامة' }
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

// التعامل مع التفاعلات (القوائم المنسدلة والأزرار)
client.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
    const guild = interaction.guild;
    const member = interaction.member;
    const selectedValue = interaction.values[0];

    let ticketTypeName = 'أخرى';
    if (selectedValue === 'ticket_management') ticketTypeName = 'التواصل مع الإدارة';
    else if (selectedValue === 'ticket_complaints') ticketTypeName = 'الشكاوي';
    else if (selectedValue === 'ticket_roles') ticketTypeName = 'طلب رول';
    else if (selectedValue === 'ticket_other') ticketTypeName = 'اخرى';

    try {
      await interaction.deferReply({ ephemeral: true });

      // إنشاء روم التكت داخل الكاتيجوري المحددة وبصلاحيات الرول المطلوب
      const ticketChannel = await guild.channels.create({
        name: `ticket-${member.user.username}`,
        type: 0, // Text Channel
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
          }
        ]
      });

      // إرسال رسالة البداية داخل التكت
      const embed = new EmbedBuilder()
        .setImage(BANNER_IMAGE_URL)
        .setColor('#2b2d31');

      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('اغلاق').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('استلام').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
        new ButtonBuilder().setCustomId('ticket_summon').setLabel('استدعاء').setStyle(ButtonStyle.Secondary).setEmoji('➡️')
      );

      await ticketChannel.send({
        content: `<@${member.id}> | <@&${SUPPORT_ROLE_ID}>\n\nنوع التذكرة : **${ticketTypeName}**\n\n**اكتب مشكلتك قبل لانجي**`,
        embeds: [embed],
        components: [controlRow]
      });

      await interaction.editReply({ content: `تم إنشاء التكت بنجاح: <#${ticketChannel.id}>` });
    } catch (e) {
      console.error(e);
      await interaction.editReply({ content: 'حدث خطأ أثناء إنشاء التكت!' });
    }
    return;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;
    const channel = interaction.channel;
    const member = interaction.member;

    // زر استدعاء (Summon)
    if (customId === 'ticket_summon') {
      const now = Date.now();
      const cooldownTime = 15000; // 15 ثانية
      const lastSummon = summonCooldowns.get(member.id) || 0;

      if (now - lastSummon < cooldownTime) {
        const remainingSeconds = Math.ceil((cooldownTime - (now - lastSummon)) / 1000);
        await interaction.reply({ content: `يرجى الانتظار ${remainingSeconds} ثانية قبل استخدام زر الاستدعاء مرة أخرى.`, ephemeral: true });
        return;
      }

      summonCooldowns.set(member.id, now);
      await channel.send({ content: `تم استدعاء الدعم الفني بواسطة <@${member.id}>، نرجو الحضور في أسرع وقت!` });
      await interaction.reply({ content: 'تم إرسال تنبيه الاستدعاء بنجاح.', ephemeral: true });
      return;
    }

    // زر استلام (Claim)
    if (customId === 'ticket_claim') {
      if (!member.roles.cache.has(SUPPORT_ROLE_ID) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: 'هذا الزر مخصص لفريق الدعم فقط!', ephemeral: true });
        return;
      }

      try {
        await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { ViewChannel: false });
        await channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });

        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('اغلاق').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('ticket_open').setLabel('فتح').setStyle(ButtonStyle.Success).setEmoji('🔓')
        );

        await interaction.message.edit({ components: [updatedRow] }).catch(() => {});
        
        await interaction.reply({ content: `تم استلام التكت بواسطة <@${member.id}>.`, ephemeral: true });
        await channel.send({ content: `تم استلام التذكرة من قبل الإداري <@${member.id}>.` });
      } catch (e) {
        console.error(e);
        await interaction.reply({ content: 'حدث خطأ أثناء استلام التكت.', ephemeral: true });
      }
      return;
    }

    // زر فتح (Open) بعد الاستلام أو الإغلاق
    if (customId === 'ticket_open') {
      if (!member.roles.cache.has(SUPPORT_ROLE_ID) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: 'صلاحية غير مأذونة!', ephemeral: true });
        return;
      }

      try {
        await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { ViewChannel: true });

        const normalRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('اغلاق').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('استلام').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
          new ButtonBuilder().setCustomId('ticket_summon').setLabel('استدعاء').setStyle(ButtonStyle.Secondary).setEmoji('➡️')
        );

        await interaction.message.edit({ components: [normalRow] }).catch(() => {});
        await interaction.reply({ content: 'تم فتح التكت وإظهاره لفريق الدعم مرة أخرى.', ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: 'حدث خطأ أثناء فتح التكت.', ephemeral: true });
      }
      return;
    }

    // زر إغلاق (Close)
    if (customId === 'ticket_close') {
      await interaction.reply({ content: 'جاري إغلاق التكت خلال 3 ثواني...', ephemeral: true });
      setTimeout(async () => {
        try {
          await channel.delete();
        } catch (e) {}
      }, 3000);
      return;
    }
  }
});

client.login(process.env.TOKEN);
