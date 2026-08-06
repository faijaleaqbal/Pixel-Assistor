// src/commands/crypto/price.js
// Look up the live price of a coin via CoinGecko.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { getPrice, searchCoin } = require('../../utils/cryptoApi');

const ALIAS = { btc: 'bitcoin', eth: 'ethereum', usdt: 'tether', usdc: 'usd-coin', sol: 'solana', matic: 'matic-network', ada: 'cardano', xrp: 'ripple', doge: 'dogecoin', ltc: 'litecoin', trx: 'tron', bnb: 'binancecoin', ton: 'the-open-network', shib: 'shiba-inu', pepe: 'pepe', wif: 'dogwifcoin', sui: 'sui', apt: 'aptos', arb: 'arbitrum', op: 'optimism', avax: 'avalanche-2', link: 'chainlink', uni: 'uniswap', aave: 'aave', dot: 'polkadot', atom: 'cosmos', near: 'near', ftm: 'fantom', mkr: 'maker', snx: 'havven', comp: 'compound-governance-token', crv: 'curve-dao-token', ldo: 'lido-dao', rpl: 'rocket-pool', fdusd: 'first-digital-usd' };

module.exports = {
  name: 'price',
  aliases: ['pr'],
  category: 'crypto',
  description: 'Look up the live price of a coin (CoinGecko).',
  usage: '<coin>',
  cooldown: 5,
  args: true,
  async execute(message, args) {
    // Accept multi-word coin names: ?price bitcoin cash, ?price bitcoin
    const q = (args.join(' ') || '').toLowerCase().trim();
    if (!q) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Usage: \`${config.prefix}price <coin>\``)] });

    // First token is checked against ALIAS for ticker shorthand (btc→bitcoin).
    // If only the first token is in ALIAS we use that; otherwise we fall back to
    // the full query string.
    const firstTok = q.split(/\s+/)[0];
    let coinId = ALIAS[firstTok] || ALIAS[q] || q;
    // Safety: if ALIAS lookup somehow produced an empty/undefined value, fall back to q
    if (!coinId) coinId = q;
    let coinName = coinId; // for display

    const m = await message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⏳ Fetching price…')] });

    try {
      let data = await getPrice(coinId).catch(() => null);

      // Direct lookup failed — try search
      if (!data) {
        // Belt-and-suspenders: never pass empty string to searchCoin
        if (!q || !q.trim()) {
          return m.edit({ embeds: [new EmbedBuilder().setColor(0xED4245)
            .setTitle('❌ Coin not found')
            .setDescription(`No results for **""** on CoinGecko.\n\nTry: \`${config.prefix}price bitcoin\`, \`${config.prefix}price eth\`, \`${config.prefix}price sol\``)] });
        }
        const results = await searchCoin(q);
        if (!results.length) {
          return m.edit({ embeds: [new EmbedBuilder().setColor(0xED4245)
            .setTitle('❌ Coin not found')
            .setDescription(`No results for **"${q}"** on CoinGecko.\n\nTry: \`${config.prefix}price bitcoin\`, \`${config.prefix}price eth\`, \`${config.prefix}price sol\``)] });
        }
        coinId = results[0].id;
        coinName = results[0].name || coinId;
        data = await getPrice(coinId);
      } else if (!coinName || coinName === coinId) {
        // Try to get a nicer display name from search
        try {
          const sr = await searchCoin(coinId);
          if (sr.length && sr[0].id === coinId) coinName = sr[0].name || coinId;
        } catch { /* ignore */ }
      }

      const change = data.usd_24h_change || 0;
      const arrow = change >= 0 ? '📈' : '📉';
      const color = change >= 0 ? 0x57F287 : 0xED4245;

      // Fetch the coin's image URL via the search endpoint — the hardcoded
      // api.coingecko.com/coin/images/<id>/thumb URL pattern is unreliable and
      // returns 404 for most coins. If search fails, just skip the thumbnail.
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

      const priceEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`💰 ${coinName}`)
        .addFields(...embedFields)
        .setFooter({ text: 'CoinGecko • Prices are live' })
        .setTimestamp();
      if (thumbnailUrl) priceEmbed.setThumbnail(thumbnailUrl);

      await m.edit({ embeds: [priceEmbed] });

    } catch (e) {
      const msg = e.message || 'Unknown error';
      console.error(`[price] Command error for query "${q}": ${msg}`, e);
      let desc;
      if (msg.includes('rate limit') || msg.includes('429')) {
        desc = '⚠️ **CoinGecko rate limit hit.** Wait 30 seconds and try again.\n\nTip: Add a `COINGECKO_API_KEY` in `.env` for higher limits (free at coingecko.com).';
      } else if (msg.includes('timed out')) {
        desc = '⏳ **CoinGecko timed out.** The API might be slow right now. Try again in a moment.';
      } else if (msg.includes('status 400') || msg.includes('status 422')) {
        desc = `❌ **Couldn't find that coin.** Try the full name (e.g. \`bitcoin\`) or ticker symbol (e.g. \`btc\`).\n\nExamples: \`${config.prefix}price bitcoin\`, \`${config.prefix}price eth\`, \`${config.prefix}price sol\``;
      } else if (msg.includes('Unknown coin id')) {
        desc = `❌ **Couldn't find that coin.** Try the full name or symbol.\n\nExamples: \`${config.prefix}price bitcoin\`, \`${config.prefix}price eth\`, \`${config.prefix}price sol\``;
      } else {
        desc = `Price lookup failed: **${msg}**`;
      }
      await m.edit({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(desc)] });
    }
  },
};
