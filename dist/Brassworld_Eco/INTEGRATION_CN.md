# 接入原版前后端：供开发成员使用

## 关键边界

本包没有原游戏服务器的源代码。`backend/integration.py` 是**有明确接口的适配器**，不是已经接通 Render 的补丁。
必须由持有自有规则引擎的成员实现文中接口，才保留完整原版玩法。
不要在代理返回 JSON 后只改显示数字：AI 仍可能按旧费用建厂、旧现金排序，环保行动也不会消耗原版行动。

## 后端规范化数据

引擎适配层使用下列规范化结构，原引擎字段不同就做映射：

```python
state = {
    "cities": {"riga": {"name": "Riga"}, "rotterdam": {"name": "Rotterdam"}},
    "players": {
        "0": {"money": 30, "spent": 0, "vp": 0},
        "1": {"money": 30, "spent": 0, "vp": 0},
    },
    "tiles": {
        "unique-instance-uuid": {
            "owner": "0", "city": "rotterdam", "industry": "MFG",
            "flipped": False,
        }
    },
    "over": False,
    # 还应有原引擎自己的卡牌、资源、时代、回合、版本等状态。
}
```

玩家 id 一律用字符串，城市使用原版 id；工厂每次新建获得新的唯一 id。
不要以“城市+槽位”当工厂 id：覆盖重建后会错误继承旧厂改造与奖励标记。

创建正式新局：

```python
from backend.eco_rules import EcoRules
rules = EcoRules()
rules.initialize(state, enabled=True)  # 或 False；所有城市污染从 0 开始
```

`eco` 整体进入同一个权威存档，包含 `schema/config/enabled/pollution/upgraded/rewarded/green/finalized`。
旧存档缺少 eco 时，按普通模式初始化；不要偷偷给进行中的旧局打开环保规则。
现版 schema 为 1；正式导入存档必须验证类型、城市白名单、污染 0–10、工厂 id、所有者和数值范围。
演示不提供任意存档导入接口。

## 事务执行顺序

`execute_owned_game(state, actor, request, engine)` 返回一个修改后的副本，输入不会被修改。
HTTP 层或数据库必须锁定对应游戏，验证 expected revision，并在一个事务中执行、保存和加版本。
前端发送的 actor 不可信，必须由已验证的玩家会话推导。

适配器要求 engine 实现以下接口：

| 接口 | 职责 |
|---|---|
| `validate_turn(state, actor, request)` | 检查整局未结束、轮到该玩家、有行动、版本匹配 |
| `validate_discard(state, actor, discard)` | 确认要弃的牌属于该玩家且满足行动要求；此时不移除 |
| `validate_base(state, actor, request)` | 验证所有原版行动条件；Build 返回权威基础总费用，含原版资源费、不含污染费；不修改状态 |
| `apply_base(state, actor, request)` | 执行原版行动、消耗资源、扣基础费用、翻面、更新收入；此时不扣行动/弃牌、不触发 AI |
| `consume_action(state, actor, discard)` | 恰好弃一张牌、恰好消耗一次行动 |
| `advance(state)` | 需要时推进回合、发收入、时代结算、基础最终计分；不要在内部跳过适配器偷偷执行 AI |

新增治理和改造不调用 `validate_base/apply_base`，但仍经过回合和弃牌验证，再消耗一次行动。
普通行动不应在 `apply_base` 中再次扣牌/行动，否则会重复扣除。
原版 Scout 的多弃牌特殊行为，需由适配层把 `discard` 视为原引擎认可的弃牌选择结构，并让 `consume_action` 按该类型执行；**不是把原版 Scout 强改为弃一张牌**。
示例中字段称为 discard，但可携带多张牌索引，具体由原引擎验证。

调用示意（框架和事务接口需要朋友的项目提供）：

```python
from backend.integration import execute_owned_game

# 这里不是完整 HTTP handler：game_repository 和 engine 是原项目的真实对象。
with game_repository.locked_transaction(game_id) as record:
    # actor 由服务器会话决定；检查 request 的 revision 后才能执行。
    updated = execute_owned_game(record.state, actor, request, engine)
    record.save(updated)
```

Build：附加费在执行前读取。验证现金足够基础费用+污染费，先扣污染费并计入 spent，再由基础引擎扣原费用。
Sell：request 使用 `tile_ids`；先验证整组原版出售条件，再逐厂记录排放与绿色分，随后执行实际出售。任一步失败全部回滚。
新环保行动的请求分别是 `{kind: 'CLEAN_UP', city, discard}` 与 `{kind: 'ECO_UPGRADE', tile_id, discard}`。

## 合法行动和预览

原版 BUILD 候选项在返回前端前，用 `rules.quote_build` 加上污染费，现金不足的候选项去掉。
原版 SELL 候选项附加 `rules.quote_sale`：排放前后污染、实际新增值、绿色奖励。
一次多厂出售时必须在临时副本中顺序预览，不能把每一厂都按同一旧污染值预览。
合法 Clean Up：有自己工厂、污染>0、有£5、有行动、有可弃牌。
合法 Eco Upgrade：自己的未翻面销售厂、没改造过、有£8、有行动、有可弃牌。

原版 action index `i` 只在对应状态版本下有效。服务器要保留生成的候选项或重新生成确定性候选项，不能信任前端传来的费用、奖励、所有者。
所有 AI 同样走适配器。AI 最低限度必须使用新总费用判断买不买得起，否则禁止声称兼容环保模式。

## 前端接入

原项目新增引用 `frontend/eco-panel.js`，或将其中 DOM 渲染合并到自己的 UI。

```javascript
import { mountEcoPanel } from './eco-panel.js';
const panel = mountEcoPanel(document.querySelector('#eco-panel'), {
  onAction: async ({id, revision}) => {
    // 这里替换成你们自己的完整游戏接口；应打开原弃牌确认流程。
    const response = await fetch('/YOUR_GAME_API/action', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id, revision, discard: selectedDiscard}),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    renderWholeGame(body.state);
    return body.ecoPanel;
  }
});
// 每次刷新完整局面后：panel.update(serverPayload.ecoPanel)
```

上面 `selectedDiscard/renderWholeGame` 是原项目已有流程，必须接到真实选择与渲染函数；不是可直接执行的独立代码。
真正可直接运行的联调前端是 `frontend/app.js`，对应本包 `server.py`。

面板 payload：

```json
{
  "enabled": true,
  "revision": 42,
  "green": 2,
  "finalized": false,
  "cities": [{"id":"riga","name":"Riga","pollution":6,"surcharge":5}],
  "actions": [{"id":"server-generated-id","label":"Clean Up · Riga","detail":"£5 · Pollution 6 → 3 · 1 action + discard"}]
}
```

原地图保留，只在城市 tooltip 加污染数字与费用。销售预览加污染前后数字；不要把大面积背景改黑。
原版已有英文主题脚本可能会重写 DOM，新增 UI 应使用独立容器或在渲染生命周期内更新，避免重复插入。

## 最终计分与时代切换

- 第一时代结束不转换绿色分。
- 最终基础计分完成，设置 over=True，再调用 `rules.finalize(state)`。
- finalized 标记进入存档，保证刷新/重试不会重复加分。
- 删掉一级工厂、覆盖建厂时，原版负责移除旧厂；新厂不要继承其唯一 id。
- 污染以城市为键持续保留，时代切换不能重新 initialize。

## 文件部署

先开独立开发分支，保留旧项目。集成通过后再部署。
不要把本包的 `server.py` 替换现有 `serve.py`：它只服务环保测试场。
本包不包含 Render 配置修改、不修改音乐、不连接原服务器、不安装后台常驻程序。
