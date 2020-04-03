module.exports = function Tera_Fish(mod) {
	const Start_Delay     = [1000, 2000];     // 开始游戏 [最低, 最高] 毫秒(ms)
	const Success_Delay   = [2000, 8000];     // 完成游戏 [最低, 最高] 毫秒(ms)
	const MoveItemDelay   = [200, 500];       // 添加[鱼类]项目的延迟
	const Fish_Salad      = [206020, 206040]; // 魚沙拉, [活動]魚沙拉
	const Craftable_Baits = [                 // 鱼饵/蚯蚓 关联信息
		{abnormalityId:   70271, itemId: 206000, maxAmount:  60, recipeId: null},   // 最初阶鱼饵
		{abnormalityId:   70281, itemId: 206005, maxAmount: 300, recipeId: null},   // 最初阶蚯蚓
		{abnormalityId:   70272, itemId: 206001, maxAmount:  60, recipeId: 204100}, //   初阶鱼饵
		{abnormalityId:   70282, itemId: 206006, maxAmount: 300, recipeId: 204100}, //   初阶蚯蚓
		{abnormalityId:   70273, itemId: 206002, maxAmount:  60, recipeId: 204101}, //   中阶鱼饵
		{abnormalityId:   70283, itemId: 206007, maxAmount: 300, recipeId: 204101}, //   中阶蚯蚓
		{abnormalityId:   70274, itemId: 206003, maxAmount:  60, recipeId: 204102}, //   高阶鱼饵
		{abnormalityId:   70284, itemId: 206008, maxAmount: 300, recipeId: 204102}, //   高阶蚯蚓
		{abnormalityId:   70275, itemId: 206004, maxAmount:  60, recipeId: 204103}, // 最高阶鱼饵
		{abnormalityId:   70285, itemId: 206009, maxAmount: 300, recipeId: 204103}, // 最高阶蚯蚓
		{abnormalityId:   70276, itemId: 206053, maxAmount:  60, recipeId: null},   // 填塞式集魚餌
		{abnormalityId: 5050003, itemId: 223133, maxAmount:  50, recipeId: null}    // [活動] 福袋路亞
	];
	
	let Enabled         = true,   // 总开关
		AutoGet         = true,   // 自动提取[鱼饵] 小跟班(个人仓库)
		AutoCraft       = true,   // 自动加工[鱼饵]
		AutoSell        = true,   // 自动出售[鱼类]
		AutoDismantle   = true,   // 自动分解[鱼类]
		DiscardFilets   = true,   // 自动丢弃[鱼肉]
		ReUseFishSalad  = true,   // 自动沙拉
		Discard_Counts  = 5000,   // 丢弃[鱼肉]数量/次
		Cast_Distance   = 3;      // 抛竿蓄力层数 默认x3 (0-18)
	
	let hooks           = [],
		craftableBaits  = null,
		lastContact     = {},     // 上一次NPC连接
		lastDialog      = {},     // 上一次NPC对话
		myLocation      = {},     // 当前坐标
		myAngle         = 0,      // 当前角度
		myServant       = null,   // 跟班信息
		wareExtend      = null,   // 个人仓库
		currentBait     = null,   // 激活 鱼饵/蚯蚓
		
		nowDate         = 0,      // 当前时间
		beginTime       = 0,      // 抛竿计时
		waitTime        = 0,      // 上钩计时
		startTime       = 0,      // 开始小游戏 延迟
		endTime         = 0,      // 完成小游戏 延迟
		gameCount       = 0,      // 小游戏次数
		
		baitAmount      = 0,      // 鱼饵数量
		fishingRod      = null,   // 钓竿编号
		
		crafting        = false,  // 加工鱼饵
		recipeId        = 204103, // 加工配方 204103->204102->204101->204100
		successCount    = 0,      // 加工次数
		
		spawning        = false,  // 召唤跟班
		getting         = false,  // 提取鱼饵
		
		selling         = false,  // 出售鱼类
		dismantling     = false,  // 分解鱼类
		cannotDismantle = false,  // 鱼肉饱和
		itemsToProcess  = [],     // 筛选道具项目
		
		discarding      = false,  // 丢弃鱼肉
		useSalad        = false;  // 使用沙拉
	
	mod.game.initialize('inventory');
	
	mod.game.me.on('change_zone', (zone, quick) => {
		lastContact = {};
		lastDialog  = {};
		
		if (zone == 2000) {
			craftableBaits = Craftable_Baits.filter(obj => obj.itemId==206053);
		} else {
			craftableBaits = Craftable_Baits.filter(obj => obj.itemId!=206053);
		}
	});
	
	mod.command.add(["钓鱼", "fish"], (arg, value) => {
		if (!arg) {
			Enabled = !Enabled;
			if (Enabled) {
				load();
			} else {
				unload();
			}
			SendMessage("自动钓鱼(Fishing) " + (Enabled ? "启用(On)" : "禁用(Off)"));
		} else {
			switch (arg) {
				case "提取":
					AutoGet = !AutoGet;
					SendMessage("自动[提取]鱼饵 " + (AutoGet ? "启用" : "禁用"));
					break;
				case "立即提取":
					StartGettingBait();
				case "加工":
					AutoCraft = !AutoCraft;
					SendMessage("自动[加工]鱼饵 " + (AutoCraft ? "启用" : "禁用"));
					break;
				case "出售":
					AutoSell = !AutoSell;
					SendMessage("自动[出售]鱼类 " + (AutoSell ? "启用" : "禁用"));
					break;
				case "立即出售":
					StartSelling();
					break;
				case "分解":
					AutoDismantle = !AutoDismantle;
					SendMessage("自动[分解]鱼类 " + (AutoDismantle ? "启用" : "禁用"));
					break;
				case "立即分解":
					StartDismantling();
					break;
				case "丢弃":
					value = parseInt(value);
					if (!isNaN(value)) {
						Discard_Counts = value;
						SendMessage("设定丢弃[数量] " + Discard_Counts);
					} else {
						DiscardFilets = !DiscardFilets;
						SendMessage("自动[丢弃]鱼肉 " + (DiscardFilets ? "启用" : "禁用"));
					}
					break;
				case "立即丢弃":
					StartDiscarding();
					break;
				case "沙拉":
					ReUseFishSalad = !ReUseFishSalad;
					SendMessage("自动使用[沙拉] " + (ReUseFishSalad ? "启用" : "禁用"));
					break;
				case "距离":
					value = parseInt(value);
					if (!isNaN(value)) {
						Cast_Distance = valiDate(value, 0, 18, 3);
						SendMessage("设置抛竿[距离] " + Cast_Distance);
					} else {
						SendMessage("设置抛竿[距离] 参数要求 数字类型");
					}
					break;
				case "状态":
					FishStatus();
					break;
				default :
					SendMessage("无效的参数!");
					break;
			}
		}
	});
	
	function FishStatus() {
		SendStatus(" --- 自动钓鱼模组 各功能状态 ---",
			"模组开关: " + (Enabled       ? "On" : "Off"),
			"提取鱼饵: " + (AutoGet       ? "On" : "Off"),
			"鱼饵加工: " + (AutoCraft     ? "On" : "Off"),
			"合成配方: " + recipeId,
			"自动出售: " + (AutoSell      ? "On" : "Off"),
			"自动分解: " + (AutoDismantle ? "On" : "Off"),
			"丢弃鱼肉: " + (DiscardFilets ? "On" : "Off"),
			"丢弃数量: " + Discard_Counts,
			"抛竿距离: " + Cast_Distance
		);
	}
	
	function SendStatus(msg) {
		SendMessage([...arguments].join('\n\t - '));
	}
	
	mod.hook('C_NPC_CONTACT', 2, event => {
		Object.assign(lastContact, event);
	});
	
	mod.hook('C_DIALOG', 2, event => {
		Object.assign(lastDialog, event);
	});
	
	mod.hook('C_PLAYER_LOCATION', 5, event => {
		if ([0, 1, 5, 6].includes(event.type)) {
			Object.assign(myLocation, event.loc);
			myAngle = event.w;
		}
	});
	
	mod.hook('S_ABNORMALITY_BEGIN', 4, event => {
		if (!mod.game.me.is(event.target)) return;
		if (craftableBaits.find(obj => obj.abnormalityId==event.id)) {
			currentBait = craftableBaits.find(obj => obj.abnormalityId==event.id);
			baitAmount = mod.game.inventory.getTotalAmount(currentBait.itemId);
		}
	});
	
	mod.hook('S_ABNORMALITY_END', 1, event => {
		if (!mod.game.me.is(event.target)) return;
		if (craftableBaits.find(obj => obj.abnormalityId==event.id)) {
			currentBait = null;
		}
		if (Enabled && ReUseFishSalad && event.id==70261) useSalad = true;
	});
	
	mod.hook('S_REQUEST_SPAWN_SERVANT', 4, event => {
		if (!mod.game.me.is(event.ownerId) || event.spawnType!=0) return;
		myServant = event;
	});
	
	mod.hook('S_REQUEST_DESPAWN_SERVANT', 1, event => {
		if (!myServant || myServant.gameId!=event.gameId || event.despawnType!=0) return;
		myServant = null;
	});
	
	mod.hook('S_SYSTEM_MESSAGE', 1, event => {
		var msg = mod.parseSystemMessage(event.message);
		
		var itemId = null;
		if (msg.tokens && msg.tokens.ItemName) {
			itemId = parseInt(msg.tokens.ItemName.match(/\d+/ig));
		}
		
		switch (msg.id) {
			case 'SMT_ITEM_USED_ACTIVE':
				if (itemId && craftableBaits.find(obj => obj.itemId==itemId)) {
					Enabled = true;
					load();
					SendMessage("已激活 " + mod.game.inventory.find(itemId).data.name + " 模组开启");
				}
				break;
			case 'SMT_ITEM_USED_DEACTIVE':
				if (itemId && craftableBaits.find(obj => obj.itemId==itemId)) {
					Enabled = false;
					unload();
					SendMessage("已冻结 " + mod.game.inventory.find(itemId).data.name + " 模组关闭");
				}
				break;
			/* 
			'SMT_FISHING_RESULT_SUCCESS' 釣魚成功。
			'SMT_FISHING_RESULT_FAIL' 釣魚失敗。
			'SMT_FISHING_RESULT_CANCLE' 釣魚已取消。
			'SMT_CANNOT_FISHING_NON_BAIT' 要先使用誘餌。
			'SMT_CANNOT_FISHING_NON_AREA' 已離開釣魚區域。
			SMT_FISHING_BITE_WAIT 釣魚中。到有反應為止，請等待。
			SMT_FISHING_BITE_STATE 好像釣到什麼了。請按下 {ActionKey}鍵，將東西釣上來吧。	{autoWaitingTime}秒後，會自動把魚釣起。
			 */
			case 'SMT_CANNOT_FISHING_FULL_INVEN': // 背包空間不足，無法使用。
				if (Enabled && !selling && !dismantling) {
					if (AutoSell) {
						if (mod.game.inventory.getTotalAmount(204052) < 30) {
							SendMessage("背包[鱼肉]不足...跳过出售");
						} else {
							SendMessage("背包[空间]不足...尝试出售");
							StartSelling();
							break;
						}
					}
					if (AutoDismantle) {
						SendMessage("背包[空间]不足...尝试分解");
						StartDismantling();
						break;
					}
				}
				break;
			case 'SMT_ITEM_CANT_POSSESS_MORE': // 背包已滿，無法獲取{ItemName}。
				/* if (Enabled && itemId && craftableBaits.find(obj => obj.itemId==itemId)) {
					SendMessage("背包[鱼饵]饱和...停止加工!");
					crafting = false;
				} */
				if (Enabled && itemId && [204052, 206215].includes(itemId)) {
					SendMessage("背包[鱼肉]饱和...停止分解!");
					cannotDismantle = true;
				}
				break;
			/* 
			case 'SMT_GENERAL_CANT_REG_ITEM_LIMIT': // 無法再登錄道具。
				SendMessage(`无法再登录更多道具项目!! - [分解栏]`);
				break;
			 */
		}
	});
	
	function load() {
		if (!hooks.length) {
			hook('C_USE_ITEM',                  3, cUseItem);
			
			hook('C_CAST_FISHING_ROD',          2, cCastFishingRod);
			hook('S_CAST_FISHING_ROD',          1, sCastFishingRod);
			hook('S_FISHING_BITE',              1, sFishingBite);
			hook('S_START_FISHING_MINIGAME',    1, sStartFishingMiniGame);
			
			hook('S_REQUEST_SERVANT_INFO_LIST', 3, sRequestServantInfoList);
			hook('S_VIEW_WARE_EX',              1, sViewWareEx);
			
			hook('S_END_PRODUCE',               1, sEndProduce);
			
			hook('S_REQUEST_CONTRACT',          1, sRequestContract);
		}
	}
	
	function hook() {
		hooks.push(mod.hook(...arguments));
	}
	
	function unload() {
		if (hooks.length) {
			for (let h of hooks) {
				mod.unhook(h);
			}
			hooks = [];
		}
		reset();
	}
	
	function reset() {
		baitAmount      = 0;
		fishingRod      = null;
		crafting        = false;
		recipeId        = 204103;
		successCount    = 0;
		spawning        = false;
		getting         = false;
		selling         = false;
		dismantling     = false;
		cannotDismantle = false;
		itemsToProcess  = [];
		discarding      = false;
		useSalad        = false;
	}
	// 使用沙拉
	function cUseItem() {
		if (useSalad && mod.game.inventory.find(Fish_Salad)) {
			var item = mod.game.inventory.find(Fish_Salad);
			useSalad = false;
			UseItem(item);
			SendMessage("~使用道具~ " + item.data.name + " 恢复钓鱼!");
			mod.setTimeout(StartFishing, 3000);
			return false;
		}
	}
	// 确认数据
	function valiDate(value, lowerBound, upperBound, defaultValue) {
		value = parseInt(value);
		if (isNaN(value)) return defaultValue;
		if (value < lowerBound) return lowerBound;
		if (value > upperBound) return upperBound;
		return value;
	}
	// 抛竿
	function cCastFishingRod(event) {
		if (AutoSell && (!lastContact.gameId || !lastDialog.id)) {
			SendMessage("未曾访问过[杂货]NPC, 已关闭自动[出售]功能!!!", 21);
			AutoSell = false;
		}
		
		event.castDistance = valiDate(Cast_Distance, 0, 18, 3);
		return true;
	}
	// 抛竿
	function sCastFishingRod(event) {
		if (!mod.game.me.is(event.gameId)) return;
		
		fishingRod = event.fishingRod;
		nowDate = new Date();
		beginTime = nowDate.getTime();
		if (baitAmount==0 && currentBait==null) {
			SendMessage("~暂停钓鱼~ 当前[鱼饵]已经用尽...尝试切换鱼饵");
			mod.setTimeout(ActiveBait, 3000);
		}
		if (baitAmount!=0 && !selling && !dismantling && !discarding) {
			SendMessage("~开始钓鱼~ " +
				mod.game.inventory.find(event.fishingRod).data.name + " | " +
				mod.game.inventory.find(currentBait.itemId).data.name + " x" + baitAmount
			);
		}
	}
	// 随机延迟
	function randomDelay([min, max], lowerBound) {
		lowerBound = isNaN(lowerBound) ? Number.NEGATIVE_INFINITY : lowerBound;
		min = parseInt(min);
		max = parseInt(max);
		if (isNaN(min) || isNaN(max)) return lowerBound;
		
		const result = Math.floor(Math.random() * (max - min + 1)) + min;
		return result >= lowerBound ? result : lowerBound;
	}
	// 有鱼上钩
	function sFishingBite(event) {
		if (!mod.game.me.is(event.gameId)) return;
		
		nowDate = new Date();
		waitTime = (nowDate.getTime() - beginTime);
		SendMessage("~有鱼上钩~ " + waitTime/1000 + "s");
		
		startTime = randomDelay(Start_Delay, 1000);
		mod.setTimeout(() => {
			mod.send('C_START_FISHING_MINIGAME', 2, {
				counter: ++gameCount
			});
			SendMessage(`~开始游戏~ ${startTime}ms | ${gameCount}次`);
		}, startTime);
	}
	// 完成小游戏
	function sStartFishingMiniGame(event) {
		if (!mod.game.me.is(event.gameId)) return;
		
		endTime = randomDelay(Success_Delay, 2000);
		mod.setTimeout(() => {
			mod.send('C_END_FISHING_MINIGAME', 2, {
				counter: gameCount,
				success: true
			});
			nowDate = new Date();
			SendMessage(`~完成游戏~ ${endTime}ms | Lv${event.level} | ${(nowDate.getTime()-beginTime)/1000}s`);
		}, endTime);
		baitAmount = mod.game.inventory.getTotalAmount(currentBait.itemId);
		return false;
	}
	// 使用物品
	function UseItem(item) {
		if (!item) return;
		
		mod.send('C_USE_ITEM', 3, {
			gameId: mod.game.me.gameId,
			id: item.id,
			dbid: item.dbid,
			// target: 0n,
			amount: 1,
			// dest: {x: 0, y: 0, z: 0},
			loc: myLocation,
			w: myAngle,
			// unk1: 0,
			// unk2: 0,
			// unk3: 0,
			unk4: true
		});
	}
	// 重新激活背包[鱼饵]
	function ActiveBait() {
		var baitItemIds = [];
		for (let bait of craftableBaits) {
			baitItemIds.push(bait.itemId);
		}
		
		if (mod.game.inventory.find(baitItemIds)) {
			var scanningBait = mod.game.inventory.find(baitItemIds);
			UseItem(scanningBait);
			SendMessage("~激活鱼饵~ " + scanningBait.data.name + " 恢复钓鱼!");
			mod.setTimeout(StartFishing, 3000);
		} else if (AutoGet) {
			SendMessage("~暂停钓鱼~ 当前[鱼饵]已经用尽...尝试提取");
			mod.setTimeout(StartGettingBait, 3000);
		} else if (AutoCraft && mod.game.me.zone!=2000) {
			SendMessage("~暂停钓鱼~ 背包[鱼饵]已经用尽...尝试加工");
			mod.setTimeout(StartCraftingBait, 3000);
		} else {
			SendMessage("~停止钓鱼~ 背包[鱼饵]已经用尽!");
			mod.clearAllTimeouts();
		}
	}
	// 重新开始[钓鱼]
	function StartFishing() {
		UseItem(mod.game.inventory.find(fishingRod));
	}
	// 开始提取[鱼饵]
	function StartGettingBait() {
		if (!myServant) {
			StartSpawning();
		} else {
			StartGetWare();
		}
	}
	// 开始召唤跟班
	function StartSpawning() {
		SendMessage("------开启[自动召唤]系统------");
		spawning = true;
		
		mod.send('C_REQUEST_SERVANT_INFO_LIST', 1, {
			gameId: mod.game.me.gameId
		});
	}
	// 小跟班目录
	function sRequestServantInfoList(event) {
		if (!spawning) return;
		
		if (event.servants.length > 0) {
			for (let servant of event.servants) {
				if (servant.abilities.find(obj => (obj.id==22 || obj.id==23))) {
					mod.setTimeout(() => {
						SendMessage("~召唤系统~ 尝试召唤 宠物/伙伴!");
						mod.send('C_REQUEST_SPAWN_SERVANT', 1, {
							id: servant.id,
							dbid: servant.dbid
						});
						mod.setTimeout(StartGettingBait, 2000);
					}, 1000);
					return;
				}
			}
			SendMessage("未找到[个人仓库]的技能, 已关闭[自动提取]功能!!!", 21);
			spawning = false;
			AutoGet = false;
			mod.setTimeout(ActiveBait, 3000);
		} else {
			SendMessage("未登陆 宠物/伙伴, 已关闭[自动提取]功能!!!", 21);
			spawning = false;
			AutoGet = false;
			mod.setTimeout(ActiveBait, 3000);
		}
	}
	// 开启个人仓库
	function StartGetWare() {
		SendMessage("------开启[个人仓库]搜寻------[鱼饵]");
		mod.send('C_SERVANT_ABILITY', 1, {
			gameId: myServant.gameId,
			skill: myServant.abilities.find(obj => (obj.id==22 || obj.id==23)).id
		});
		mod.setTimeout(StartGetWareItem, 3000);
	}
	// 个人仓库
	function sViewWareEx(event) {
		if (!mod.game.me.is(event.gameId)) return;
		wareExtend = event;
	}
	// 提取鱼饵
	function StartGetWareItem() {
		var baitItemIds = [];
		for (let bait of craftableBaits) {
			baitItemIds.push(bait.itemId);
		}
		
		var scanningBait = null;
		for (let baitID of baitItemIds) {
			if (scanningBait = wareExtend.items.find(item => item.id==baitID)) break;
		}
		
		if (scanningBait) {
			var maxGetBaitAmount = craftableBaits.find(obj => obj.itemId==scanningBait.id).maxAmount;
			SendMessage("~个人仓库~ 提取鱼饵!");
			mod.send('C_GET_WARE_ITEM', 3, {
				gameId: mod.game.me.gameId,
				type: wareExtend.type,
				page: wareExtend.offset,
				gold: 0,
				bankSlot: scanningBait.amountTotal,
				dbid: scanningBait.dbid,
				id: scanningBait.id,
				amont: ((scanningBait.amount < maxGetBaitAmount) ? scanningBait.amount : maxGetBaitAmount),
				invenPocket: -1,
				invenSlot: -1
			});
			mod.setTimeout(() => {
				/* SendMessage("------关闭[个人仓库]------");
				mod.send('S_VIEW_WARE_EX', 1, {
					gameId: mod.game.me.gameId,
					action: 1
				}); */
				SendMessage("~召唤系统~ 解除召唤 宠物/伙伴 恢复钓鱼!");
				mod.send('C_REQUEST_DESPAWN_SERVANT', 1, {});
				mod.setTimeout(ActiveBait, 3000);
			}, 1000);
			return;
		} else if ((wareExtend.offset+72) < wareExtend.slots) {
			SendMessage("~个人仓库~ 切换分页...重新搜寻");
			mod.send('C_VIEW_WARE', 2, {
				gameId: mod.game.me.gameId,
				type: 9,
				offset: (wareExtend.offset+72)
			});
			mod.setTimeout(StartGetWareItem, 2000);
		} else {
			SendMessage("未找到合适的[鱼饵], 已关闭[自动提取]功能!!!", 21);
			mod.send('C_REQUEST_DESPAWN_SERVANT', 1, {});
			mod.setTimeout(ActiveBait, 3000);
			AutoGet = false;
		}
	}
	// 开始加工[鱼饵]
	function StartCraftingBait() {
		SendMessage("------开启[鱼饵加工]系统------");
		if (!crafting) successCount = 0;
		crafting = true;
		
		mod.send('C_START_PRODUCE', 1, {
			recipe: recipeId,
			unk: 0
		});
	}
	// 完成加工[鱼饵]
	function sEndProduce(event) {
		if (!crafting) return;
		
		if (event.success) {
			SendMessage("~鱼饵[加工]~ 任务成功x" + successCount++);
			mod.setTimeout(StartCraftingBait, 3000);
		} else if (successCount==0 && mod.game.inventory.getTotalAmount(204052)<30 && AutoDismantle) {
			SendMessage("~鱼饵[加工]~ 任务失败...尝试分解");
			crafting = false;
			mod.setTimeout(StartDismantling, 3000);
		} else if (successCount==0 && recipeId>204099) {
			SendMessage("~鱼饵[加工]~ 任务失败...更换配方 " + --recipeId);
			mod.setTimeout(StartCraftingBait, 3000);
		} else {
			SendMessage("~鱼饵[加工]~ 任务全部结束 恢复钓鱼!");
			crafting = false;
			mod.setTimeout(ActiveBait, 3000);
			if (recipeId < 204100) {
				SendMessage("未学习[鱼饵]制作配方, 已关闭[自动加工]功能!!!", 25);
				AutoCraft = false;
			}
		}
	}
	// 开始出售[鱼类]
	function StartSelling() {
		SendMessage("------开启[自动出售]系统------");
		selling = true;
		
		itemsToProcess = mod.game.inventory.items.filter(item => (item.id>206399 && item.id<206500));
		processItemsToSell();
	}
	// 开始分解[鱼类]
	function StartDismantling() {
		SendMessage("------开启[自动分解]系统------");
		dismantling = true;
		
		itemsToProcess = mod.game.inventory.items.filter(item => (item.id>206399 && item.id<206500));
		processItemsToDismantle();
	}
	// 开始丢弃[鱼肉]
	function StartDiscarding() {
		SendMessage("------开启[自动丢弃]系统------");
		discarding = true;
		
		var delItem;
		if (mod.game.me.zone != 2000) {
			delItem = mod.game.inventory.find(204052); // 魚肉
		} else {
			delItem = mod.game.inventory.find(206215); // 磯鱲魚魚片
		}
		if (delItem) {
			mod.send('C_DEL_ITEM', 3, {
				gameId: mod.game.me.gameId,
				pocket: delItem.pocket,
				slot: delItem.slot,
				amount: Math.min(delItem.amount, Discard_Counts)
			});
			SendMessage("~鱼肉[丢弃]~ 任务完成 恢复钓鱼!");
			discarding = false;
			mod.setTimeout(StartFishing, 3000);
		}
	}
	// 添加出售[鱼类]
	function processItemsToSell() {
		if (itemsToProcess.length > 0) {
			SendMessage("~正在添加[出售]项目~");
			mod.send('C_NPC_CONTACT', 2, lastContact);
			let dialogHook;
			const timeout = mod.setTimeout(() => {
				if (dialogHook) {
					mod.unhook(dialogHook);
					selling = false;
					if (AutoDismantle) {
						SendMessage("提交会话NPC超时...尝试分解");
						StartDismantling();
					}
				}
			}, 3000);
			dialogHook = mod.hookOnce('S_DIALOG', 2, event => {
				mod.clearTimeout(timeout);
				mod.send('C_DIALOG', 2, Object.assign(lastDialog, {id: event.id}));
			});
		}
	}
	// 添加分解[鱼类]
	function processItemsToDismantle() {
		if (itemsToProcess.length > 0) {
			SendMessage("~正在添加[分解]项目~");
			mod.send('C_REQUEST_CONTRACT', 1, {
				type: 90,
				unk2: 0,
				unk3: 0,
				unk4: 0,
				name: "",
				data: Buffer.alloc(0)
			});
		}
	}
	// 出售/分解会话
	function sRequestContract(event) {
		if (!dismantling && !selling) return;
		
		var delay = randomDelay(MoveItemDelay, 200);
		switch (event.type) {
			case 9:
				if (itemsToProcess.length > 0) {
					for (let item of itemsToProcess.slice(0, 18)) {
						mod.setTimeout(() => {
							AddOneItemToSellBasket(event, item);
						}, delay);
						delay += randomDelay(MoveItemDelay, 200);
					}
					itemsToProcess = itemsToProcess.slice(18);
					mod.setTimeout(() => {
						StarSellBasket(event);
					}, delay+3000);
				} else {
					SendMessage("~鱼类[出售]~ 任务全部完成 恢复钓鱼!");
					selling = false;
					CancelContract(event);
					mod.setTimeout(StartFishing, 3000);
				}
			break;
			case 90:
				const handleContract = () => {
					for (let item of itemsToProcess.slice(0, 20)) {
						mod.setTimeout(() => {
							if (cannotDismantle) return;
							AddOneItemToDecomposition(event, item);
						}, delay);
						delay += randomDelay(MoveItemDelay, 200);
					}
					itemsToProcess = itemsToProcess.slice(20);
					mod.setTimeout(() => {
						StartDecomposition(event);
						mod.setTimeout(() => {
							if (cannotDismantle) {
								itemsToProcess = [];
								cannotDismantle = false;
								dismantling = false;
								CancelContract(event);
								if (DiscardFilets && Discard_Counts > 0) {
									SendMessage("无法[分解]更多鱼肉...尝试丢弃");
									mod.setTimeout(StartDiscarding, 3000);
								}
								return;
							}
							if (itemsToProcess.length > 0) {
								handleContract();
							} else {
								SendMessage("~鱼类[分解]~ 任务全部完成 恢复钓鱼!");
								dismantling = false;
								CancelContract(event);
								if (!currentBait) {
									mod.setTimeout(ActiveBait, 3000);
								} else {
									mod.setTimeout(StartFishing, 3000);
								}
							}
						}, 3000);
					}, delay+3000);
				};
				handleContract();
			break;
		}
	}
	// 添加分解项目
	function AddOneItemToSellBasket(event, item) {
		SendMessage("添加[出售项目]: " + item.id + " - " + item.data.name);
		mod.send('C_STORE_SELL_ADD_BASKET', 2, {
			gameId: mod.game.me.gameId,
			contract: event.id,
			item: item.id,
			amount: item.amount,
			pocket: item.pocket,
			slot: item.slot
		});
	}
	// 提交出售会话
	function StarSellBasket(event) {
		SendMessage("------本轮[出售项目]添加完成------提交[出售]任务");
		mod.send('C_STORE_COMMIT', 1, {
			gameId: mod.game.me.gameId,
			contract: event.id
		});
	}
	// 添加分解项目
	function AddOneItemToDecomposition(event, item) {
		SendMessage("添加[分解项目]: " + item.id + " - " + item.data.name);
		mod.send('C_RQ_ADD_ITEM_TO_DECOMPOSITION_CONTRACT', 1, {
			contract: event.id,
			dbid: item.dbid,
			id: item.id,
			count: 1
		});
	}
	// 提交分解会话
	function StartDecomposition(event) {
		SendMessage("------本轮[分解项目]添加完成------提交[分解]任务");
		mod.send('C_RQ_START_SOCIAL_ON_PROGRESS_DECOMPOSITION', 1, {
			contract: event.id
		});
	}
	// 关闭当前会话
	function CancelContract(event) {
		mod.send('C_CANCEL_CONTRACT', 1, {
			type: event.type,
			id: event.id
		});
	}
	// 发送提示文字
	function SendMessage(msg, chl) {
		if (chl) {
			mod.send('S_CHAT', 3 , {
				channel: chl, // 21 = 队长通知, 1 = 组队, 2 = 公会, 25 = 团长通知
				name: 'TIP',
				message: msg
			});
		} else {
			mod.command.message(msg);
		}
	}
}
