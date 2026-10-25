/* Display-only localization. API responses, action values and saves stay untouched. */
export { rules, differences, tour } from './tutorial.js';
const geography = await fetch('/theme/geography.json').then(r => r.json());
const glossary = {
  ...geography,
  '工业革命 · 世界':'Brassworld — An Industrial Atlas','工业革命：世界':'Brassworld — An Industrial Atlas',
  '工业革命世界':'Brassworld','工业革命':'Industrial Revolution','世界地图':'World map','世界':'World','地图':'Map',
  'Brass: Birmingham 同人世界地图 · 80 城 · 21 区域 · 4 人局（你与 3 个 AI）':'A world-spanning Brass variant · 80 cities · 21 regions · You and three AI rivals',
  'Brass: Birmingham 规则 · 世界地图 · 进度自动保存于本机浏览器':'Brass: Birmingham rules · World map · Progress autosaved in this browser',
  '你玩过《工业革命：伯明翰》吗？':'Have you played Brass: Birmingham before?',
  '只看与伯明翰不同的地方，再认识界面':'Discover the world-map variant, then take a tour.',
  '从规则讲起，再逐一认识界面':'Learn the rules, then explore the interface.',
  '价值网络 + 抽样模拟搜索，最强；每轮需等十余秒':'Value network with sampled search; strongest, but slower.',
  '价值网络 + 整回合前瞻':'Value network with full-turn lookahead',
  '价值网络，偶有次优选择':'Value network, with occasional suboptimal choices',
  '启发式评分，随机性较大':'Heuristic evaluation with more varied play',
  '分配本土、洗牌；先行的 AI 正在行动':'Assigning home regions and shuffling the deck. Opening AI turns are being played.',
  '进度自动保存于本机浏览器':'Progress autosaved in this browser',
  '本回合剩余动作':'Actions remaining this turn','背景音乐（M）':'Background music (M)',
  '全局视图（F）':'World view (F)','定位本土（H）':'Go to home region (H)',
  '仅显示你的网络（可以建造的城市）':'Show your network and cities where you can build',
  '高亮你的产业（I）':'Highlight your industries (I)',
  '跳过剩余回放，直接看结果（Esc）':'Skip the remaining replay (Esc)',
  '不执行动作，弃 1 张牌':'Pass this action and discard one card',
  '英伦实业家':'British industrialist','欧陆工厂主':'European manufacturer','美国铁路商':'American rail baron',
  '南美庄园主':'South American planter','华商买办':'Chinese merchant','明治实业家':'Meiji industrialist',
  '孟买纺织商':'Bombay textile trader','南洋侨商':'Straits merchant','开罗棉商':'Cairo cotton trader','悉尼羊毛商':'Sydney wool trader',
  '兰开夏':'Lancashire','不列颠':'Britain','欧陆':'Europe','美洲':'Americas','亚太':'Asia-Pacific',
  '棉纺厂':'Cotton mill','制造厂':'Manufacturer','陶瓷厂':'Pottery','酿酒厂':'Brewery','煤矿':'Coal mine','铁厂':'Iron works',
  '帆船时代':'Sail Era','蒸汽时代':'Steam Era','仅帆船时代':'Sail Era only','仅蒸汽时代':'Steam Era only',
  '万用区域牌':'Wild region card','万用产业牌':'Wild industry card','万用牌':'Wild card','区域牌':'Region card','产业牌':'Industry card',
  '新开一局':'New game','开始新对局':'Begin the game','返回对局':'Return to game','继续上局':'Resume game',
  '正在开局':'Preparing the world','AI 难度':'AI difficulty','AI 行动':'AI turns','推荐走法':'Suggested moves',
  '你的头像':'Your portrait','新手':'Novice','老练':'Experienced','大师':'Expert','宗师':'Master',
  '背景音乐':'Background music','动画速度':'Animation speed','镜头跟随':'Camera','跟随 AI 行动':'Follow AI turns',
  '逐步（点击继续）':'Step by step','自动播放':'Autoplay','不动':'Fixed','极快':'Very fast','正常':'Normal','音量':'Volume',
  '存档':'Save game','导出存档文件':'Export save','导入存档文件':'Import save','保存在这台设备上':'Saved on this device',
  '还没有可导出的存档':'There is no saved game to export yet.','存档文件无法读取':'Unable to read this save file.',
  '存档无法读取':'Unable to load the saved game.','存档已导入':'Save imported.','已恢复上一局':'Previous game restored.',
  '已读取本地存档':'Local save loaded','会话已恢复，请重新操作':'Game restored. Please select your action again.',
  '局面已更新，请重新选择':'The game state has changed. Please select again.','网络错误':'Connection error',
  '菜单':'Menu','玩法':'How to play','规则':'Rules','设置':'Settings','全局':'World','本土':'Home',
  '我的产业':'My industries','我的':'Mine','网络':'Network','行动记录':'Game journal','记录':'Journal',
  '板件 · 下一块':'Next industry tiles','板件总览':'Industry board','全部板件':'All tiles','板件':'Tiles','手牌':'Hand',
  '市场':'Market','建造':'Build','连接':'Connect','销售':'Sell','开发':'Develop','贷款':'Loan','侦查':'Scout',
  '其他玩家行动中…':'Other players are taking their turns…','等待其他玩家…':'Waiting for other players…',
  '对手思考中…':'Your rivals are thinking…','对局已结束':'The game has ended','对局结束':'The final ledger',
  '查看终局地图':'View final map','再来一局':'Play again','获胜。':'You win. ','胜利点按来源拆分':'Victory points by source',
  '玩家':'Player','合计':'Total','争夺':'Shared cities','欠债':'Debt','胜利点':'Victory points',
  '收入':'Income','现金':'Cash','连线':'Links','贸易港':'Trade port','啤酒':'Beer','煤':'Coal','铁':'Iron',
  '免费开发 1 块板件（可自选）':'Develop one tile for free (your choice)',
  '收入 +2 格':'Income +2 steps','+3 胜利点':'+3 VP','免费开发':'Free development',
  '当前无可执行动作':'No actions available','无可执行动作':'No actions available','此处无该类动作':'No matching actions here',
  '可选行动':'Available actions','只能跳过':'You must pass','可跳过':'You may pass','跳过回放':'Skip replay','跳过':'Pass',
  '确认':'Confirm','取消':'Cancel','放弃':'Cancel','完成':'Done','关闭':'Close','免费':'Free',
  '选择':'Choose','筛选':'Filter','未被占用':'Unoccupied','可建':'Buildable','不可建':'Cannot build',
  '当前不可用':'Currently unavailable','不可用':'Unavailable','现金不足':'Insufficient cash','资金不足':'Insufficient funds',
  '缺牌':'No suitable card','格位已满':'All slots occupied','无未被占用的对应格位':'No suitable empty slot',
  '不在网络内':'Outside your network','须建在网络内':'Must be built in your network','网络内可建':'Buildable in your network',
  '网络内无可建':'No suitable city in your network','城不在网络内或已满':'Cities are outside your network or full',
  '网络内任一城市均可建此产业':'Build this industry in any eligible city in your network',
  '该区域任一城市均可建':'Build in any eligible city in this region','可建在任一城市':'Build in any eligible city',
  '视为任意区域':'Counts as any region','视为任意产业':'Counts as any industry','任意区域':'Any region','任意产业':'Any industry',
  '不必在网络内':'Does not need to be in your network','时代末不计分':'Does not score at era end',
  '不可开发':'Cannot be developed','只能建造':'Must be built','须建造后才能使用下一级':'Build this tile to unlock the next level',
  '需先开发':'Develop first','需开发':'Development required','本时代结束作废':'Expires at the end of this era',
  '本时代已无':'None left this era','金框为下一块':'Gold border marks the next tile',
  '无需煤铁':'No coal or iron required','所需煤铁':'Coal and iron required','造价':'Cost','购料':'Resources',
  '板件翻面后':'After flipping the tile','已翻面':'Flipped','未翻面':'Unflipped','建成产出':'Output on construction',
  '产煤':'Coal output','产铁':'Iron output','产啤酒':'Beer output','产出啤酒':'Beer output',
  '销售耗啤酒':'Beer needed to sell','销售不耗啤酒':'No beer required to sell','时代末':'Era end',
  '已开张的贸易港':'Open trade port','未开张':'Closed','已用完':'Depleted','收购':'Accepts',
  '不连港':'No open port connection','无法销售':'Cannot sell','港口奖励':'Port bonus','港内啤酒':'Port beer',
  '每个时代补满':'Refilled each era','用掉即得港口奖励':'Receive the port bonus when used',
  '用港内啤酒销售即得':'Awarded when you sell using this port’s beer',
  '售予此港时优先使用':'Use first when selling to this port','贸易港须有连线接入才开张':'A trade port opens when any built link reaches its city',
  '网络未连通开张的贸易港':'Your network is not connected to an open trade port',
  '此处未连通开张的贸易港':'This location is not connected to an open trade port',
  '也无法从市场购煤':'You cannot buy coal from the market','市场已满':'Market full',
  '只在建成时卖一次':'Sold to the market only when built','之后连通也不会补卖':'Connecting later does not trigger another sale',
  '煤留在板件上':'Coal remains on the tile','产出留在板件上':'Output remains on the tile',
  '不卖给市场':'Not sold to the market','不售市场':'Not sold to market','建成售市场':'Sold to market when built',
  '建成时卖给市场':'Sold to market on construction','自有':'Your own','对手的':'Opponent’s',
  '你的酿酒厂':'Your brewery','对手的酿酒厂':'Opponent’s brewery','对手的煤矿':'Opponent’s coal mine',
  '被取完即翻面':'Flips when depleted','啤酒取完后翻面':'Flips when all beer is used',
  '同一产业可点两次':'You may select the same industry twice','该组合不可执行':'This combination is not available',
  '按点选顺序取用':'Used in selection order','选中一项':'Select an action','块要移除的板件':'tiles to remove',
  '网络互通':'Networks connected','市场合并':'Markets merged','合并':'Merged','现价':'Current price','存货':'Stock',
  '轮到你了':'Your turn','点任意处继续':'Click anywhere to continue','点击继续':'Click to continue',
  '下一步':'Next','上一步':'Back','继续':'Continue','结束导览':'Finish tour','认识界面 →':'Explore the interface →',
  '认识界面':'Interface tour','会玩':'I know the game','不会玩':'I’m new to Brass','与伯明翰的不同':'The world-map variant',
  '其余规则与《工业革命：伯明翰》相同':'All other rules follow Brass: Birmingham.',
  '查看完整规则':'Read all rules','查看完整面板':'View the full industry board',
  '对手得分和收入':'Rival points and income','你得分和收入':'Your points and income',
  '抽取顺位':'Drawing turn order','游戏开始':'The world opens','开始游戏':'Begin game','发放收入':'Income paid',
  '帆船时代即将结束':'The Sail Era is drawing to a close','即将进入蒸汽时代':'Entering the Steam Era',
  '已翻面板件计分':'Score flipped industry tiles','连线按两端板件的连线分计分':'Links score the link values of flipped tiles at both ends',
  '级板件与全部连线将被清除':'level tiles and all links will be removed',
  '两个时代':'Two eras','最终排名':'Final standings','上轮花费少者先行动':'Lowest spending last round goes first',
  '本轮花费少者下轮先行':'Spend less this round to act earlier next round',
  '行动的第几步':'Action step','你会看到他们的每一步':'Watch each move your rivals make',
  '件货物可销售':'industries can sell','件货物未售出':'industries have not sold',
  '你在地图上还没有产业':'You have no industries on the map yet',
  '点击查看全部板件':'Click to view all industry tiles','点击查看':'Click to view','点击定位':'Click to locate',
  '可贷款':'Loan available','收入低时贷款代价最小':'Loans cost least when income is low',
  '海运线':'Shipping link','双铺':'Double connection','海运':'Shipping','陆路':'Land route',
  '不执行动作':'Take no action','仅弃':'Discard only','弃牌':'Discard','弃':'Discard',
  '取用':'Use','外购':'Buy','还差':'Still needed','覆盖':'Overbuild','收益':'Rewards','资金':'Funds',
  '备注':'Notes','前面':'Earlier','标注':'Marked','耗煤':'Coal used','耗铁':'Iron used',
  '第一轮':'First round','本回合':'This turn','本轮':'This round','上一局':'Previous game',
  '帆':'Sail','蒸':'Steam','连通':'Connected','互通':'Connected','已与':'Connected to ',
  '区域':'Region','产业':'Industry','行动':'Action','目标':'Objective','操作':'Controls',
  '结算':'Scoring','收':'Inc','分':'VP','开':'On','关':'Off','慢':'Slow','快':'Fast','低':'Low','中':'Medium','高':'High',
  '你':'You','煤铁':'Coal and iron','朱红':'Vermilion','钴蓝':'Cobalt','墨绿':'Forest','金黄':'Ochre','紫罗兰':'Violet','橙褐':'Rust',
  '伦敦交易所':'London Exchange','利物浦码头':'Liverpool Docks','克莱德港':'Port of Clyde',
  '阿姆斯特丹交易所':'Amsterdam Exchange','鹿特丹集散地':'Rotterdam Entrepôt','马赛黎凡特行':'Marseille Levant Company',
  '纽约港':'New York Harbor','新奥尔良棉市':'New Orleans Cotton Exchange','旧金山金门港':'Golden Gate Harbor',
  '里约热内卢港':'Port of Rio de Janeiro','孟买管区':'Bombay Presidency','上海外滩':'Shanghai Bund',
  '香港转口港':'Hong Kong Entrepôt','横滨居留地':'Yokohama Foreign Settlement','亚历山大棉花交易所':'Alexandria Cotton Exchange',
  '悉尼码头':'Sydney Docks','新加坡转口港':'Singapore Entrepôt',
  '霍桑':'Hawthorne','阿尔瓦雷斯':'Alvarez','哈灵顿':'Harrington',
  '换取万用牌':'Take wild cards','收入退':'Reduce income by','级':'levels','牌库':'Deck',
  '换取':'Take','开局随机':'Random opening order','本轮顺位':'Turn order','顺位':'Turn order',
  '按上一轮花费从少到多':'Lowest spending in the previous round acts first',
  '提高收入':'Increase income','巩固本土':'Strengthen the home region',
  '无煤可用：此处未与有煤的煤矿或开张的贸易港连通':'No coal available: connect this location to a mine with coal or an open trade port.',
  '伯格曼':'Bergmann','魏格纳':'Wegner','蒙塔尔托':'Montalto',
  '隐私模式等情况下存不了':'Saving may be unavailable in private browsing','不影响游戏':'Gameplay is unaffected',
  '对手思考中':'Your rivals are thinking','会话已恢复':'Game restored','请重新操作':'Please select the action again',
  '局面已更新':'The game state has changed','请重新选择':'Please select again',
  '售空后按':'After selling out, follow','网络可达':'Reachable through your network','万用':'Wild','可用':'Available',
  '售予市场':'Sold to market','帆船时代建成放':'Output when built in the Sail Era','蒸汽时代建成放':'Output when built in the Steam Era',
  '须连通收购此货':'Connect to a port accepting these goods','的未占用格位':'eligible empty slots',
  '网络外':'Outside your network','同原作的地点牌':'Like location cards in the original','视为':'Counts as',
  '虚线标出':'Marked with dashed lines','移除':'Remove','块板件':'industry tiles','每块':'Per tile',
  '其他玩家行动中':'Other players are taking their turns','等待其他玩家':'Waiting for other players',
  '现金不足以支付':'Insufficient cash to pay','各产业按等级依次使用':'Use industry tiles in level order',
  '不能用开发移除':'Cannot be removed by developing',
  '每条通到该城的连线在时代末多得这么多分':'Victory points added to each link connected to this city at era end',
  '归修线的人':'Awarded to the link’s owner','建成时放在板件上的资源数':'Resources placed on the tile when built',
  '双方各得':'Each player receives','本时代已由':'Already claimed this era by',
  '领取':'Claim','个可选动作':'available actions','已建成':'Built','建造费用':'Construction cost',
  '原因见提示框':'See the tooltip for details','该连线':'This link','轮结束':'End of round','卖出':'Sold',
  '轮的行动顺序随机决定':'round turn order is drawn randomly','位对手先行动':'rivals act before you',
  '轮每人只有':'round each player has only','个动作':'actions','之后每回合':'Each subsequent turn',
  '逐步':'Step by step','跟随':'Follow','获胜':'Victory','结束':'End','港口':'Port','港内':'At the port',
  '张牌':'cards','块铁':'iron','需':'Requires','或':'or','差':'Short by','块':'tiles','桶':'beer',
  '余':'Remaining','另':'Additional','城':'cities','等':'etc.','件':'industries','张':'cards',
  '产':'Output','经':'via','得':'Receive','选':'Choose','售':'Sell','与':'and','第':'No.',
  '轮':'round','个':'','名':'place',
  '装煤的矿车':'Coal wagon','铁砧':'Anvil','木箱':'Crate','绕满线的线轴':'Spool of thread',
  '原作图标':'Original icon','工厂':'Factory','宗师':'Master',
};


const names = new Map();
export function registerPlayers(players = []) {
 for (const p of players) if (p.name) names.set(p.name, p.isMe ? 'You' : (exact[p.name] || glossary[p.name] || `Rival ${Number(p.id) + 1}`));
}
const han = /[\u3400-\u9fff]/;
export const untranslated = new Set();
const exact = {
 '德尚':'Deschamps',
 '万用区域':'Wild region', '万用产业':'Wild industry', '连通贸易港（双铺）':'Connect to a trade port (double connection)',
 '范德堡':'Vanderbilt', '为后续布局':'Prepare for future moves', '售出货物':'Sell goods',
 '时代末计分':'Score at era end', '进驻对手城市':'Build in a rival’s city', '争夺奖分':'Earn shared-city points',
 '手牌与网络不符':'Cards do not match the network', '收入尚低':'Income is still low',
 '贷款代价小':'Loans cost less now', '淘汰低级板件':'Remove lower-level tiles',
 '进入蒸汽时代：Ⅰ级板件与全部连线已清除':'Entering the Steam Era: level I tiles and all links have been removed',
 '3 胜利点':'3 VP',

 '麦克莱伦':'McClellan', '阿什沃思':'Ashworth', '彭伯顿':'Pemberton',
 '弗格森':'Ferguson', '格林伍德':'Greenwood', '卡莱尔':'Carlyle',
 '连通贸易港':'Connect to a trade port', '扩展网络':'Expand the network',
 '建成即售予市场':'Sell output to market immediately after construction',
 '回收资金':'Recover cash', '提高收入':'Increase income', '巩固本土':'Strengthen the home region',
};
// Each rule consumes a complete message. Captures are translated as complete tokens/messages.
const patterns = [
 [/^(\d+)\.(.+)$/, (rank,entry) => `${rank}. ${translate(entry)}`],
 [/^(.+) · 弃「(.+)」$/, (action, cards) => `${translate(action)} · Discard: ${translate(cards)}`],
 [/^下一块为(.+?)[，,]蒸汽时代不可用[，,]需先开发$/, tile => `Next tile: ${translate(tile)}; unavailable in the Steam Era. Develop it first.`],
 [/^(.+?)不可用$/, era => `Unavailable in the ${translate(era)}`],
 [/^交通连通：(.+?)与(.+?)煤铁市场合并$/, (a,b) => `Transport connection: the ${translate(a)} and ${translate(b)} coal and iron markets merge`],
 [/^侦查：换取(.+)$/, cards => `Scout: take ${translate(cards)}`],
 [/^取用 (.+?) 于 (.+?) 的(.+?) ×(\d+)$/, (who,city,industry,n) => `Use ${n} resources from ${translate(who)}’s ${translate(industry)} in ${translate(city)}`],
 [/^建造 (.+?) · (.+?)（£(\d+)），覆盖(.+)$/, (tile,city,cost,over) => `Build ${translate(tile)} in ${translate(city)} (£${cost}), overbuilding ${translate(over)}`],
 [/^开发 (.+?)（£(\d+)）$/, (tiles,cost) => `Develop ${translate(tiles)} (£${cost})`],
 [/^销售 (\d+) 件（(.+)）$/, (n,tiles) => `Sell ${n} industries: ${translate(tiles)}`],
 [/^销售 (.+?) · (.+)$/, (tile,city) => `Sell ${translate(tile)} in ${translate(city)}`],
 [/^获得 (.+?) 港口奖励：(.+)$/, (port,bonus) => `Receive the ${translate(port)} port bonus: ${translate(bonus)}`],
 [/^免费开发 (.+)$/, tile => `Develop ${translate(tile)} for free`],
 [/^贷款 £(\d+)（收入 −(\d+) 级）$/, (cash,levels) => `Loan: £${cash}; income reduced by ${levels} levels`],
 [/^资金不足：拆除 (.+?) · (.+?)，得 £(\d+)$/, (tile,city,cash) => `Insufficient funds: liquidate ${translate(tile)} in ${translate(city)} for £${cash}`],
 [/^★ (.+?)结束：(.+)$/, (era,scores) => `★ ${translate(era)} ends: ${translate(scores)}`],
 [/^(.+?) (-?\d+)分$/, (name,vp) => `${translate(name)}: ${vp} VP`],
 [/^最终排名：(.+)$/, scores => `Final standings: ${translate(scores)}`],

 [/^(.+?) 本土：(.+)$/, (who, home) => `${translate(who)} — home region: ${translate(home)}`],
 [/^本轮顺位：(.+)（开局随机）$/, order => `Turn order: ${translate(order)} (random opening order)`],
 [/^本轮顺位：(.+)（按上一轮花费从少到多）$/, order => `Turn order: ${translate(order)} (lowest spending last round first)`],
 [/^(.+) (£[\d]+)$/, (who, cash) => `${translate(who)} ${cash}`],
 [/^建造 (.+?) · (.+?)（£(\d+)）$/, (tile, city, cost) => `Build ${translate(tile)} in ${translate(city)} (£${cost})`],
 [/^连接 (.+?)（(海运|陆路)，£(\d+)）$/, (route, kind, cost) => `Connect ${translate(route)} (${translate(kind)}, £${cost})`],
 [/^与 (.+?) 网络首次互通：双方各得 £(\d+)、收入 \+(\d+)$/, (who, cash, income) => `Networks connected with ${translate(who)} for the first time: each player receives £${cash} and +${income} income`],
 [/^第 (\d+) 轮结束：发放收入；本轮花费少者下轮先行$/, round => `Round ${round} ends: income paid; lower spending acts earlier next round`],
 [/^(.+?)·(.+)$/, (tile,city) => `${translate(tile)} in ${translate(city)}`],
 [/^(.+?)([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)$/, (industry, level) => `${translate(industry)} ${level}`],
];
// Historical server messages still contain pounds; render all money as USD.
export function translate(value) {
 return translateRaw(value).replaceAll('£', 'US$');
}
function translateRaw(value) {
 if (value == null) return '';
 const text = String(value), trimmed = text.trim();
 if (!han.test(text)) return text;
 const known = names.get(trimmed) || exact[trimmed] || glossary[trimmed];
 if (known) return known;
 for (const [pattern, format] of patterns) { const m = trimmed.match(pattern); if (m) { const result = format(...m.slice(1)); if (!han.test(result)) return result; } }
 // Separators delimit complete list entries, never arbitrary word fragments.
 for (const separator of [' · ', '、', '，', '」「', '  ', ' + ', '/', '—']) {
  if (trimmed.includes(separator)) {
   const parts = trimmed.split(separator).map(translate);
   if (parts.every(p => !han.test(p) && p !== 'Game message unavailable in English.')) return parts.join(separator === '—' ? ' — ' : separator === '/' ? ' / ' : ', ');
  }
 }
 untranslated.add(text);
 console.warn('Untranslated game message:', text);
 return text; // Preserve an unknown message intact, never invent or partially translate its meaning.
}


// New replay notifications use typed event fields, independent of the backend's sentence wording.
// Historical logs contain text only, so translate() handles those complete messages as a fallback.
export function describeAction(event, board) {
 const city = id => translate(board.cities.find(c => c.id === id)?.zh || id);
 const tile = item => `${translate(board.industryZh[item.industry] || item.industry)} ${['', 'Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ','Ⅹ'][item.level] || item.level || ''}`.trim();
 let text;
 switch (event.kind) {
  case 'BUILD':
   text = `Build ${tile(event)} in ${city(event.city)} (£${event.cost})`;
   if (event.over) text += `, overbuilding ${tile(event.over)}`;
   break;
  case 'NETWORK':
   text = `Connect ${[event.link,event.second].filter(Boolean).map(link => link.map(city).join(' — ')).join(' + ')} (£${event.cost})`;
   break;
  case 'SELL':
   text = `Sell ${(event.sells || [event]).map(item => `${tile(item)} in ${city(item.city)}`).join(', ')}`;
   break;
  case 'DEVELOP': text = `Develop ${(event.dev || [event]).map(tile).join(', ')} (£${event.cost})`; break;
  case 'LOAN': text = 'Loan: £30; income reduced by 3 levels'; break;
  case 'SCOUT': text = 'Scout: take a wild region card and a wild industry card'; break;
  default: return translate(event.text || 'Pass');
 }
 if (event.discarded?.length) text += ` · Discard: ${event.discarded.map(translate).join(', ')}`;
 return text.replaceAll('£', 'US$');
}
