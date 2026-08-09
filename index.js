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

const summonCooldowns = new Map();

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
  if (message.author.bot) return;

  const contentLower = message.content.toLowerCase().trim();

  if (contentLower === 'delete') {
    if (!message.member.roles.cache.has(ADMIN_ROLE_ID) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    try {
      await message.channel.delete();
    } catch (e) {}
    return;
  }

  // منع صاحب التذكرة من كتابة أو تنفيذ إغلاق إذا كان هو صاحب التذكرة، إلا السبورت أو الإدارة
  if (contentLower === 'إغلاق' || contentLower === 'اغلاق') {
    if (message.channel.parentId === CATEGORY_ID) {
      try {
        const guild = message.guild;
        const channel = message.channel;
        
        let ownerId = null;
        const permissionEntries = channel.permissionOverwrites.cache.values();
        for (const entry of permissionEntries) {
          if (entry.type === 1 && entry.id !== guild.ownerId) {
            ownerId = entry.id;
            break;
          }
        }

        // إذا الكاتب هو صاحب التذكرة، امنعه من الإغلاق
        if (message.author.id === ownerId && !message.member.roles.cache.has(SUPPORT_ROLE_ID) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await message.reply({ content: 'لا يمكنك إغلاق تذكرتك بنفسك!', ephemeral: true });
          return;
        }

        await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { ViewChannel: false });
        if (ownerId) {
          await channel.permissionOverwrites.edit(ownerId, { ViewChannel: false });
        }

        await channel.permissionOverwrites.edit(ADMIN_ROLE_ID, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });

        const openRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_open').setLabel('فتح').setStyle(ButtonStyle.Secondary)
        );

        const messages = await channel.messages.fetch({ limit: 10 });
        const botMsg = messages.find(m => m.author.id === client.user.id && m.components.length > 0);
        if (botMsg) {
          await botMsg.edit({ components: [openRow] }).catch(() => {});
        }

        await message.channel.send({ content: `تم إغلاق التذكرة بواسطة <@${message.author.id}>.` });
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
    const selectedValue = interaction.values[0];

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
          }
        ]
      });

      const embed = new EmbedBuilder()
        .setImage(BANNER_IMAGE_URL)
        .setColor('#2b2d31');

      // 4 أزرار: إغلاق، استلام، استدعاء، إضافة
      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('اغلاق').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('استلام').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_summon').setLabel('استدعاء').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_add').setLabel('اضافه').setStyle(ButtonStyle.Secondary)
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

  // التعامل مع Modal زر الإضافة
  if (interaction.isModalSubmit() && interaction.customId === 'ticket_add_modal') {
    const userInput = interaction.fields.getTextInputValue('user_input').trim();
    const channel = interaction.channel;
    const member = interaction.member;

    let targetUserId = userInput.replace(/<@!?&?(\d+)>/g, '$1');

    try {
      const userToAdd = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      if (!userToAdd) {
        await interaction.reply({ content: 'لم يتم العثور على هذا المستخدم، تأكد من اليوزر أو المنشن الصحيح.', ephemeral: true });
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
      await interaction.reply({ content: 'حدث خطأ أثناء إضافة العضو.', ephemeral: true });
    }
    return;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;
    const channel = interaction.channel;
    const member = interaction.member;

    const isSupport = member.roles.cache.has(SUPPORT_ROLE_ID) || member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isAdmin = member.roles.cache.has(ADMIN_ROLE_ID) || member.permissions.has(PermissionsBitField.Flags.Administrator);

    // معرفة من هو صاحب التذكرة الفعلي
    let ownerId = null;
    const permissionEntries = channel.permissionOverwrites.cache.values();
    for (const entry of permissionEntries) {
      if (entry.type === 1 && entry.id !== interaction.guild.ownerId) {
        ownerId = entry.id;
        break;
      }
    }
    const isOwner = (member.id === ownerId);

    // زر إغلاق: صاحب التذكرة لا يمكنه الضغط عليه (يمنع تماماً)، بينما السبورت أو غيره يقدرون
    if (customId === 'ticket_close') {
      if (isOwner && !isSupport && !isAdmin) {
        await interaction.reply({ content: 'لا يمكنك إغلاق تذكرتك بنفسك!', ephemeral: true });
        return;
      }

      try {
        await interaction.reply({ content: 'جاري إغلاق التكت...', ephemeral: true });
        
        await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { ViewChannel: false });
        if (ownerId) {
          await channel.permissionOverwrites.edit(ownerId, { ViewChannel: false });
        }
        await channel.permissionOverwrites.edit(ADMIN_ROLE_ID, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });

        const openRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_open').setLabel('فتح').setStyle(ButtonStyle.Secondary)
        );

        await interaction.message.edit({ components: [openRow] }).catch(() => {});
        await channel.send({ content: `تم إغلاق التذكرة بواسطة <@${member.id}>.` });
      } catch (e) {
        console.error(e);
      }
      return;
    }

    // زر استلام: لو العضو هو صاحب التذكرة (وليس سبورت) لا يستطيع الاستلام. لو مو صاحب التذكرة (وكان سبورت) يقدر. صاحب التذكرة يقدر يستلم لو فتح تذكرة شخص آخر؟ حسب الطلب: "لو انه اللي فاتح التذكرة يقدر يستلم لكن لو انه هو اللي مو فاتح التذكرة هذا يقدر يستلم... ولازم يكون سبورت"
    if (customId === 'ticket_claim') {
      if (!isSupport) {
        await interaction.reply({ content: `هذا الزر مخصص لـ <@&${SUPPORT_ROLE_ID}>`, ephemeral: true });
        return;
      }

      try {
        await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { ViewChannel: false });
        await channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });

        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('اغلاق').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_open').setLabel('فتح').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_summon').setLabel('استدعاء').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_add').setLabel('اضافه').setStyle(ButtonStyle.Secondary)
        );

        await interaction.message.edit({ components: [updatedRow] }).catch(() => {});
        
        await interaction.reply({ content: `تم استلام التكت بواسطة <@${member.id}>.`, ephemeral: true });
      } catch (e) {
        console.error(e);
        await interaction.reply({ content: 'حدث خطأ أثناء استلام التكت.', ephemeral: true });
      }
      return;
    }

    // زر إضافة: فقط لمستلم التذكرة أو السبورت المخول
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

    // زر استدعاء (Summon): يمنشن السبورت لمدة ثانيتين ثم يحذف، ويخفي زر الاستدعاء للمستخدم لمدة 15 ثانية ثم يعود
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

      await interaction.deferReply({ ephemeral: true });
      await interaction.deleteReply().catch(() => {});

      // إرسال المنشن للسبورت وحذفه بعد ثانيتين (2000 مللي ثانية) بدون كلام طويل وبدون رسالة زرقاء ظاهرة
      try {
        const pingMsg = await channel.send({ content: `<@&${SUPPORT_ROLE_ID}>` });
        setTimeout(async () => {
          await pingMsg.delete().catch(() => {});
        }, 2000);
      } catch (e) {}

      // إخفاء زر الاستدعاء لمدة 15 ثانية ثم إعادته
      try {
        const currentMsg = interaction.message;
        const oldComponents = currentMsg.components[0].components;

        const tempRow = new ActionRowBuilder().addComponents(
          oldomp => oldComponents.map(btn => {
            if (btn.data.custom_id === 'ticket_summon') {
              return ButtonBuilder.from(btn).setDisabled(true);
            }
            return ButtonBuilder.from(btn);
          })
        );
        // تحديث بسيط للزر ليصبح معطلاً مؤقتاً
        const disabledRow = new ActionRowBuilder().addComponents(
          oldComponents.map(btn => {
            if (btn.data.custom_id === 'ticket_summon') {
              return new ButtonBuilder().setCustomId('ticket_summon').setLabel('استدعاء').setStyle(ButtonStyle.Secondary).setDisabled(true);
            }
            return ButtonBuilder.from(btn);
          })
        );

        await currentMsg.edit({ components: [disabledRow] }).catch(() => {});

        setTimeout(async () => {
          const activeRow = new ActionRowBuilder().addComponents(
            oldComponents.map(btn => {
              if (btn.data.custom_id === 'ticket_summon') {
                return new ButtonBuilder().setCustomId('ticket_summon').setLabel('استدعاء').setStyle(ButtonStyle.Secondary).setDisabled(false);
              }
              return ButtonBuilder.from(btn);
            })
          );
          await currentMsg.edit({ components: [activeRow] }).catch(() => {});
        }, 15000);

      } catch (e) {}

      return;
    }

    // زر فتح (Open)
    if (customId === 'ticket_open') {
      if (!isAdmin && !isSupport) {
        await interaction.reply({ content: 'صلاحية غير مأذونة!', ephemeral: true });
        return;
      }

      try {
        await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { ViewChannel: true });
        if (ownerId) {
          await channel.permissionOverwrites.edit(ownerId, { ViewChannel: true, SendMessages: true });
        }

        const normalRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('اغلاق').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('استلام').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_summon').setLabel('استدعاء').setStyle(ButtonStyle.Secondary),
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
