const { getNamedAccounts, network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
    ? describe.skip
    : //describe 不能识别处理promise，所以定义async function没意义
      describe("Raffle Unit Tests", function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          const chainId = network.config.chainId
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("constructor", function () {
              it("initializes the raffle correctly", async function () {
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughETHEntered",
                  )
              })
              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })
              it("emits event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter",
                  )
              })
              it("doesn't allow entrance when raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  //time travel for test. For more detail, see https://hardhat.org/hardhat-network/docs/reference#evm_increasetime
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])

                  //We pretend to be a Chainlink Keeper
                  await raffle.performUpkeep([])

                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.revertedWith(
                      "Raffle__NotOpen",
                  )
              })
          })

          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async function () {
                  //time travel for test. For more detail, see https://hardhat.org/hardhat-network/docs/reference#evm_increasetime
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //   await raffle.checkUpkeep([]) //实际发送一笔请求
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]) //模拟发送一笔请求
                  assert.equal(upkeepNeeded, false) //等价于 assert(!upkeepNeeded)
              })
              it("returns false if raffle isn't open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  //time travel for test. For more detail, see https://hardhat.org/hardhat-network/docs/reference#evm_increasetime
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //We pretend to be a Chainlink Keeper
                  await raffle.performUpkeep([]) //等价于 await raffle.performUpkeep(0x)
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if enough time hasn't passed", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  //time travel for test. For more detail, see https://hardhat.org/hardhat-network/docs/reference#evm_increasetime
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 2]) //TODO: 为什么-1不对？
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(upkeepNeeded, false)
              })

              it("returns true if enough time has passed, has players, eth ,and is open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  //time travel for test. For more detail, see https://hardhat.org/hardhat-network/docs/reference#evm_increasetime
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(upkeepNeeded, true)
              })
          })

          describe("performUpkeep", function () {
              it("it can only run if checkUpkeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  //time travel for test. For more detail, see https://hardhat.org/hardhat-network/docs/reference#evm_increasetime
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep([])
                  assert(tx) //如果tx不起作用，或者发生了报错之类的其他问题，这里就会失败
              })
              it("reverts when checkUpkeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded",
                  )
              })
              it("updates the raffle state, emits an event, and calls the vrf coordinator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  //time travel for test. For more detail, see https://hardhat.org/hardhat-network/docs/reference#evm_increasetime
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const txResponse = await raffle.performUpkeep([])
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.events[1].args.requestId
                  const raffleState = await raffle.getRaffleState()
                  assert(requestId.toNumber() > 0)
                  assert.equal(raffleState.toString(), "1")
              })
          })

          describe("fulfillRandomWords", async function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address),
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address),
                  ).to.be.revertedWith("nonexistent request")
              })

              //Massive Promise test
              it("picks a winner, resets the lottery, and sends money", async function () {
                  //抽奖参与人数
                  const additionalEntrants = 3
                  const startingAccountIndex = 1
                  const accounts = await ethers.getSigners()
                  let startingAccountValues = new Array()
                  //参与抽奖
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                      startingAccountValues[i] = await accounts[i].getBalance()
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp()

                  await new Promise(async function (resolve, reject) {
                      //配置Listener，监听WinnerPicked事件
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the WinnerPicked event!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              for (
                                  let i = startingAccountIndex;
                                  i < startingAccountIndex + additionalEntrants;
                                  i++
                              ) {
                                  if (accounts[i].address == recentWinner) {
                                      const endingAccountValue = await accounts[i].getBalance()
                                      console.log(
                                          `Winner is ${i}th player, address:${accounts[i].address}, startValue:${startingAccountValues[i]}, endValue:${endingAccountValue}`,
                                      )
                                      assert.equal(
                                          endingAccountValue.toString(),
                                          startingAccountValues[i]
                                              .add(
                                                  raffleEntranceFee
                                                      .mul(additionalEntrants)
                                                      .add(raffleEntranceFee),
                                              )
                                              .toString(),
                                      )
                                      break
                                  }
                              }
                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })

                      //below, we will fire the event, and the listener will pick it up, and resolve

                      //performUpkeep (mock being chainlink keeper)
                      const txResponse = await raffle.performUpkeep([])
                      const txReceipt = await txResponse.wait(1)
                      const requestId = txReceipt.events[1].args.requestId
                      //fulfillRandomWords (mock being chainlink vrf)
                      await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, raffle.address)
                  })
              })
          })
      })
