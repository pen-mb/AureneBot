const { Entries, Giveaway, Key, Build } = require("../dbModels/models");
const { createWinner, pickWinner, clearGiveawayAndEntries } = require("./db");
const moment = require("moment");
const logger = require("./logger");
const { gw2api } = require("./api");
const { buildDbFromApi } = require("./caching");

async function checkNewBuild(bot) {
  const currentBuild = await Build.findOne({});
  const liveBuild = await gw2api.build().get();

  if (!currentBuild) {
    await Build.create({
      build: liveBuild,
    });
  }

  if (currentBuild.build != liveBuild) {
    logger.info("(Re)building API cache");
    await bot.user.setStatus("dnd");
    await bot.user.setActivity("Building API Cache", { type: "LISTENING" });
    await buildDbFromApi();
    await bot.user.setStatus("online");
    await bot.user.setActivity("Guild Wars 2");
  }
}

async function checkGiveawayOnStartup(bot) {
  const giveawayChannel = bot.channels.get(process.env.GIVEAWAY_CHANNEL);
  const giveaway = await Giveaway.find({});

  if (giveaway[0]) {
    const item = giveaway[0].item;
    const timeout = giveaway[0].endTime - new Date();

    setTimeout(() => endGiveaway(giveaway[0], giveawayChannel, item), timeout);
  }
}

async function endGiveaway(creator, channel, item) {
  const winner = await pickWinner(Entries);

  if (!winner) {
    channel.send("Looks like no one entered the giveaway :(");
    logger.info(`No one entered the giveaway of ${item}.`);
    return await clearGiveawayAndEntries(Giveaway, Entries);
  }

  await createWinner(winner, item);
  channel.send(`Congratulations <@${winner.userId}>, you won **${item}** from <@${creator.userId}>!`);
  logger.info(`The giveaway for ${item} ended, ${winner.userName}#${winner.discriminator} won.`);
  await clearGiveawayAndEntries();
}

async function initGiveawayTimeout(creator, channel, item) {
  const giveaway = await Giveaway.findOne({});
  const endTime = giveaway.endTime;
  const duration = endTime - moment();

  return setTimeout(() => {
    endGiveaway(creator, channel, item);
  }, duration);
}

async function validateKey(message, key) {
  const userId = message.author.id;
  const userHasKey = await Key.findOne({ discordId: userId });
  const keyExists = await Key.findOne({ key: key });

  if (!key) {
    message.reply("you didn't provide a key!");
    return false;
  }

  if (key.length > 74) {
    message.delete();
    message.reply("your key is invalid, it should be a maximum of 74 characters.");
    return false;
  }

  if (userHasKey) {
    message.delete();
    message.reply("you already have a registered key. You can use the delete argument to delete it.");
    return false;
  }

  if (keyExists) {
    message.delete();
    message.reply("this key already exists in the database.");
    return false;
  }

  return true;
}

function formatAge(age) {
  const hours = Math.floor(age / 3600);
  const minutes = Math.round((age % 3600) / 60);

  if (hours) {
    return `${hours} hours ${minutes} minutes`;
  }

  return `${minutes} minutes`;
}

function filterExpansions(account) {
  return account.access
    .filter(i => !["PlayForFree", "GuildWars2"].includes(i))
    .map(i => i.replace(/([a-z])([A-Z])/g, "$1 $2"))
    .join("\n");
}

module.exports = {
  endGiveaway,
  validateKey,
  formatAge,
  filterExpansions,
  initGiveawayTimeout,
  checkNewBuild,
  checkGiveawayOnStartup,
};
