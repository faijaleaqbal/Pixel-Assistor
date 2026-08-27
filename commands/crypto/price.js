// src/commands/crypto/price.js
// Look up the live price of a coin via CoinGecko.

const responseBuilder = require('../../utils/responseBuilder');
const config = require('../../utils/config');
const { opts } = require('../../utils/v2Reply');
const { getPrice, searchCoin } = require('../../utils/cryptoApi');
const { getPrefix } = require('../../utils/prefixCache');

const ALIAS = { btc: 'bitcoin', eth: 'ethereum', usdt: 'tether', usdc: 'usd-coin', sol: 'solana', matic: 'matic-network', ada: 'cardano', xrp: 'ripple', doge: 'dogecoin', ltc: 'litecoin', trx: 'tron', bnb: 'binancecoin', ton: 'the-open-network', shib: 'shiba-inu', pepe: 'pepe', wif: 'dogwifcoin', sui: 'sui', apt: 'aptos', arb: 'arbitrum', op: 'optimism', avax: 'avalanche-2', link: 'chainlink', uni: 'uniswap', aave: 'aave', dot: 'polkadot', atom: 'cosmos', near: 'near', ftm: 'fantom', mkr: 'maker', snx: 'havven', comp: 'compound-governance-token', crv: 'curve-dao-token', ldo: 'lido-dao', rpl: 'rocket-pool', fdusd: 'first-digital-usd' };

module.exports = {
  name: 'price',
  aliases: ['pr'],
  category: 'crypto',
  description: 'Look up the live price of a coin (CoinGecko).',
  usage: '<coin>',
  cooldown: 5,
  args: true,
  slash: true,
  slashOptions: [
    {
      name: 'coin',
      description: 'Coin name or ticker (e.g. btc, sol, eth, matic)',
      type: 3,
      required: true,
    },
  ],
  async execute(message, args, client) {
    const prefix = await getPrefix(message.guild?.id);
    const q = (args.join(' ') || '').toLowerCase().trim();
    if (!q) return message.reply(opts(responseBuilder.buildResult({ description: `Usage: \`${prefix}price <coin>\``})));

    const m = await message.reply(opts(responseBuilder.buildResult({ description: '⏳ Fetching price…'})));
    const embed = await renderPriceEmbed(q, prefix);
    return m.edit(opts(embed));
  },
  async slashExecute(interaction) {
    const q = interaction.options.getString('coin', true).toLowerCase().trim();
    await interaction.deferReply();
    const embed = await renderPriceEmbed(q, '/');
    return interaction.editReply(opts(embed));
  },
};

async function renderPriceEmbed(q, prefix = '?') {
  const firstTok = q.split(/\s+/)[0];
  let coinId = ALIAS[firstTok] || ALIAS[q] || q;
  if (!coinId) coinId = q;
  let coinName = coinId;

  try {
    let data = await getPrice(coinId).catch(() => null);

    if (!data) {
      if (!q || !q.trim()) {
        return responseBuilder.buildResult({ title: '❌ Coin not found', description: `No results for **""** on CoinGecko.\n\nTry: \`${prefix}price bitcoin\`, \`${prefix}price eth\`, \`${prefix}price sol\``});
      }
      const results = await searchCoin(q);
      if (!results.length) {
        return responseBuilder.buildResult({ title: '❌ Coin not found', description: `No results for **"${q}"** on CoinGecko.\n\nTry: \`${prefix}price bitcoin\`, \`${prefix}price eth\`, \`${prefix}price sol\``});
      }
      coinId = results[0].id;
      coinName = results[0].name || coinId;
      data = await getPrice(coinId);
    } else if (!coinName || coinName === coinId) {
      try {
        const sr = await searchCoin(coinId);
        if (sr.length && sr[0].id === coinId) coinName = sr[0].name || coinId;
      } catch { /* ignore */ }
    }

    const change = data.usd_24h_change || 0;
    const arrow = change >= 0 ? '📈' : '📉';
    const color = change >= 0 ? 0x57F287 : 0xED4245;

    let thumbnailUrl = null;
    try {
      const sr2 = await searchCoin(coinId);
      if (sr2.length && sr2[0].thumb) thumbnailUrl = sr2[0].thumb;
    } catch { /* ignore */ }

    const embedFields = [
      { name: 'USD', value: `$${(data.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`, inline: true },
      { name: 'EUR', value: `€${(data.eur || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`, inline: true },
      { name: 'INR', value: `₹${(data.inr || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, inline: true },
      { name: '24h Change', value: `${arrow} ${change.toFixed(2)}%`, inline: true },
    ];
    if (data.pkr) {
      embedFields.push({ name: 'PKR', value: `₨${(data.pkr || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, inline: true });
    }

    const resultOptions = { title: `💰 ${coinName}`, fields: [...embedFields] };
    if (thumbnailUrl) resultOptions.thumbnail = thumbnailUrl;

    return responseBuilder.buildResult(resultOptions);
  } catch (e) {
    const msg = e.message || 'Unknown error';
    let desc;
    if (msg.includes('rate limit') || msg.includes('429')) {
      desc = '⚠️ **CoinGecko rate limit hit.** Wait 30 seconds and try again.\n\nTip: Add a `COINGECKO_API_KEY` in `.env` for higher limits (free at coingecko.com).';
    } else if (msg.includes('timed out')) {
      desc = '⏳ **CoinGecko timed out.** The API might be slow right now. Try again in a moment.';
    } else {
      desc = `Price lookup failed: **${msg}**`;
    }
    return responseBuilder.buildResult({ description: desc});
  }
}
