const { network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config.js")

const BASE_FEE = ethers.utils.parseEther("0.25") //0.25 is the premium. It cost 0.25 LINK per request.
const GAS_PRICE_LINK = 1e9 //calculated value based on the gas price of the chain.

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    if (developmentChains.includes(network.name)) {
        log("Local network detected! Deploying mocks...")
        //deploy a mock vrfcoordinator...
        const vrfCoordinatorV2Mock = await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: [BASE_FEE, GAS_PRICE_LINK],
        })
        log(`VRFCoordinatorV2Mock Deployed at ${vrfCoordinatorV2Mock.address}`)
        log("------------------------------------------------------------")
    }
}
module.exports.tags = ["all", "mocks"]
