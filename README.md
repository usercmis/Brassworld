# Brassworld — Combined Era beginner game

New games default to an eight-round combined era on the original world map. Build for VP and income, connect for US$5 and 3 VP, or save money. All industry levels are available without resource requirements or era resets.

Run `python3 serve.py` and open http://localhost:3000. See [COMBINED_ERA.md](COMBINED_ERA.md) for rules, compatibility, backend limitations and validation. Classic and Eco modes remain available.

---

**1. What is the goal of Brassworld?** 


- Brassworld is an economic strategy game set during the Industrial Revolution.
- You compete against three AI players to build the most successful industrial network.

 	- Build industries: Construct coal mines, iron works, breweries, and factories.
 	- Connect cities: Build transportation links to expand your network.
	- Earn money: Generate income, sell products, and finance expansion.
	- Earn victory points: Score points from industries and transportation links.

- The player with the most victory points (VP) at the end wins. Having the most money doesn't necessarily mean winning.

**2. Understand the game screen**



|Game element	 |       Meaning |
|----------------|---------------|
|Hand	         |      Your cards, which you use to perform actions
Build	          |      Construct an industry in a city
Network           |   	Connect cities with transportation links
Sell	          |      Sell goods from eligible industries
Develop	          |    	Remove lower-level industry tiles to access higher-level ones
Loan	           |     Borrow money to fund expansion
Scout	           |     Discard cards to obtain wild cards
Income	           |   	Money earned during income collection
VP	                |  	Victory points used to determine the winner

**3. How do turns work?**


- Our game has two eras:
	-  1) Sail Era: Players build their early industries and transportation networks. During the first round, each player gets only one action.
	- 2) Steam Era: More advanced industries and transportation become available.

- After the first round, players normally get two actions per turn.
- Actions generally require discarding a card, so choosing which cards to use is part of the strategy.

**4. Example: Your first turn**


Imagine you're starting a new game.
Money: $17
Income: +0
VP: 0
- You have eight cards in your hand. Suppose one card allows you to build in a city where a coal mine is available.
- You select Build, choose the city, and construct the coal mine if you meet the requirements and can afford it.
- Your money decreases, but you now own an industry that may provide resources and eventually earn points.

That's the basic idea: spend resources now to build an economy that earns more points later.




