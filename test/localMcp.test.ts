import { expect } from 'chai'
import hre from 'hardhat'
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers')

describe('MCP Integration Test', function () {
    async function deployMcpFixture() {
        const [owner, user, otherAccount] = await hre.ethers.getSigners()

        // 🧱 Deploy Mock Feed
        const MockV3Aggregator = await hre.ethers.getContractFactory('MockV3Aggregator')
        const mockFeed = await MockV3Aggregator.deploy(8, 1841000000)

        // 🚀 Deploy Provider
        const McpProvider = await hre.ethers.getContractFactory('McpProvider')
        const provider = await McpProvider.deploy(mockFeed)

        // 🧩 Deploy Consumer
        const McpConsumer = await hre.ethers.getContractFactory('McpConsumer')
        const consumer = await McpConsumer.deploy(mockFeed, provider)

        // 🪪 Register MCP License (with AVAX/USD fee)
        const requiredAvax = await provider.getLicenseFeeInAvax()
        await provider
            .connect(owner)
            .registerMcp(
                'Test MCP',
                hre.ethers.parseUnits('10', 18),
                'Test Description',
                'localhost/test',
                { value: requiredAvax },
            )

        return { owner, user, mockFeed, provider, consumer, otherAccount }
    }

    it('provider should calculate correct license fee in AVAX', async () => {
        const { provider } = await loadFixture(deployMcpFixture)
        const fee = await provider.getLicenseFeeInAvax()
        expect(fee).to.be.gt(0)
    })

    it('consumer should return correct AVAX/USD price from mock feed', async () => {
        const { consumer } = await loadFixture(deployMcpFixture)

        const price = await consumer.getLatestAvaxUsdPrice()
        expect(price).to.equal(1841000000)
    })

    it('consumer should successfully subscribe to MCP license', async () => {
        const { user, consumer, provider } = await loadFixture(deployMcpFixture)

        // Get the license price in AVAX
        const license = await provider.licenses(0)
        const priceUsd = license.usdPriceForConsumerMonth
        const latestPrice = await consumer.getLatestAvaxUsdPrice()
        const requiredAvax = (priceUsd * BigInt(10 ** 8)) / latestPrice

        // Subscribe!
        const tx = await consumer.connect(user).subscribeToMcp(0, { value: requiredAvax })
        await tx.wait()

        // Pull the subscription
        const sub = await consumer.userSubscriptions(user.address, 0)

        expect(sub.providerNonce).to.equal(0)
        expect(sub.providerAddress).to.equal(license.providerAddress)
        expect(sub.amountPaid).to.equal(requiredAvax)
        expect(sub.status).to.equal(0) // SubStatus.Active
    })

    it('should revert when subscribing to a nonexistent MCP license', async () => {
        const { user, consumer } = await loadFixture(deployMcpFixture)

        await expect(
            consumer.connect(user).subscribeToMcp(999, { value: hre.ethers.parseEther('1') }),
        ).to.be.reverted
    })

    it('should store the subscription in userSubscriptions mapping', async () => {
        const { user, consumer, provider } = await loadFixture(deployMcpFixture)

        const license = await provider.licenses(0)
        const priceUsd = license.usdPriceForConsumerMonth
        const latestPrice = await consumer.getLatestAvaxUsdPrice()
        const requiredAvax = (priceUsd * BigInt(10 ** 8)) / latestPrice

        // Subscribe
        await consumer.connect(user).subscribeToMcp(0, { value: requiredAvax })

        // Validate subscription exists at index 0
        const sub = await consumer.userSubscriptions(user.address, 0)
        expect(sub.providerNonce).to.equal(0)
        expect(sub.status).to.equal(0)

        // Manually count subscriptions
        let count = 0
        while (true) {
            try {
                await consumer.userSubscriptions(user.address, count)
                count++
            } catch {
                break
            }
        }
        expect(count).to.equal(1)
    })

    it('checkUpkeep should return true after subscription expiry', async () => {
        const { user, consumer, provider } = await loadFixture(deployMcpFixture)

        const license = await provider.licenses(0)
        const priceUsd = license.usdPriceForConsumerMonth
        const latestPrice = await consumer.getLatestAvaxUsdPrice()
        const requiredAvax = (priceUsd * BigInt(10 ** 8)) / latestPrice

        await consumer.subscribeToMcp(0, { value: requiredAvax })

        // Fast-forward 31 days
        await hre.network.provider.send('evm_increaseTime', [31 * 24 * 60 * 60])
        await hre.network.provider.send('evm_mine')

        const [upkeepNeeded, performData] = await consumer.checkUpkeep('0x')

        expect(upkeepNeeded).to.be.true
        expect(performData).to.not.equal('0x')
    })

    it('performUpkeep should mark expired subscriptions as Completed', async () => {
        const { user, consumer, provider } = await loadFixture(deployMcpFixture)

        const license = await provider.licenses(0)
        const priceUsd = license.usdPriceForConsumerMonth
        const latestPrice = await consumer.getLatestAvaxUsdPrice()
        const requiredAvax = (priceUsd * BigInt(10 ** 8)) / latestPrice

        await consumer.connect(user).subscribeToMcp(0, { value: requiredAvax })

        await hre.network.provider.send('evm_increaseTime', [31 * 24 * 60 * 60])
        await hre.network.provider.send('evm_mine')

        const [upkeepNeeded, performData] = await consumer.checkUpkeep('0x')
        expect(upkeepNeeded).to.be.true

        const tx = await consumer.performUpkeep(performData)
        await tx.wait()

        const sub = await consumer.userSubscriptions(user.address, 0)
        expect(sub.status).to.equal(1) // SubStatus.Completed
    })

    it('should revert if AVAX sent is less than required for subscription', async () => {
        const { user, consumer, provider } = await loadFixture(deployMcpFixture)

        const license = await provider.licenses(0)
        const priceUsd = license.usdPriceForConsumerMonth
        const latestPrice = await consumer.getLatestAvaxUsdPrice()
        const requiredAvax = (priceUsd * BigInt(10 ** 8)) / latestPrice

        // Underpay: 10% of required AVAX
        const underpayment = (requiredAvax * BigInt(1)) / BigInt(10)

        await expect(
            consumer.connect(user).subscribeToMcp(0, { value: underpayment }),
        ).to.be.revertedWith('Insufficient AVAX')
    })

    it('should return both active MCPs via getConsumerMcps()', async () => {
        const { consumer, provider, mockFeed, owner, user } = await loadFixture(deployMcpFixture)

        // Set AVAX/USD = $20
        await mockFeed.updateAnswer(2000000000)

        // Register MCP 1
        const tx1 = await provider
            .connect(owner)
            .registerMcp(
                'Service A',
                hre.ethers.parseUnits('10', 18),
                'Desc A',
                'https://service-a.com',
                { value: await provider.getLicenseFeeInAvax() },
            )
        const receipt1 = await tx1.wait()
        const iface = provider.interface
        const event1 = receipt1.logs
            .map((log: any) => iface.parseLog(log))
            .find((log: any) => log.name === 'McpProviderRegistered')
        const mcp1Nonce = event1.args.providerNonce

        // Register MCP 2
        const tx2 = await provider
            .connect(owner)
            .registerMcp(
                'Service B',
                hre.ethers.parseUnits('10', 18),
                'Desc B',
                'https://service-b.com',
                { value: await provider.getLicenseFeeInAvax() },
            )
        const receipt2 = await tx2.wait()
        const event2 = receipt2.logs
            .map((log: any) => iface.parseLog(log))
            .find((log: any) => log.name === 'McpProviderRegistered')
        const mcp2Nonce = event2.args.providerNonce

        const licensePriceAvax = await provider.getLicenseFeeInAvax()

        // Subscribe to both
        await consumer.connect(user).subscribeToMcp(mcp1Nonce, { value: licensePriceAvax })
        await consumer.connect(user).subscribeToMcp(mcp2Nonce, { value: licensePriceAvax })

        // Verify getConsumerMcps() returns 2 active subs
        const subs = await consumer.getConsumerMcps(user.address)
        expect(subs.length).to.equal(2)
        expect(subs[0].providerNonce).to.equal(mcp1Nonce)
        expect(subs[1].providerNonce).to.equal(mcp2Nonce)
    })

    it('should return no MCPs after 31 days and upkeep', async () => {
        const { consumer, provider, mockFeed, owner, user } = await loadFixture(deployMcpFixture)

        // Set AVAX/USD = $20
        await mockFeed.updateAnswer(2000000000)

        // --- Register MCP #1 ---
        const tx1 = await provider
            .connect(owner)
            .registerMcp(
                'Service A',
                hre.ethers.parseUnits('10', 18),
                'Desc A',
                'https://service-a.com',
                { value: await provider.getLicenseFeeInAvax() },
            )
        const receipt1 = await tx1.wait()
        const iface = provider.interface
        const event1 = receipt1.logs
            .map((log: any) => iface.parseLog(log))
            .find((log: any) => log.name === 'McpProviderRegistered')
        const mcp1Nonce = event1.args.providerNonce

        // --- Register MCP #2 ---
        const tx2 = await provider
            .connect(owner)
            .registerMcp(
                'Service B',
                hre.ethers.parseUnits('10', 18),
                'Desc B',
                'https://service-b.com',
                { value: await provider.getLicenseFeeInAvax() },
            )
        const receipt2 = await tx2.wait()
        const event2 = receipt2.logs
            .map((log: any) => iface.parseLog(log))
            .find((log: any) => log.name === 'McpProviderRegistered')
        const mcp2Nonce = event2.args.providerNonce

        const licensePriceAvax = await provider.getLicenseFeeInAvax()

        // Subscribe to both
        await consumer.connect(user).subscribeToMcp(mcp1Nonce, { value: licensePriceAvax })
        await consumer.connect(user).subscribeToMcp(mcp2Nonce, { value: licensePriceAvax })

        // Simulate 31 days
        await hre.network.provider.send('evm_increaseTime', [31 * 24 * 60 * 60])
        await hre.network.provider.send('evm_mine')

        // Perform upkeep
        const [upkeepNeeded, upkeepData] = await consumer.checkUpkeep('0x')
        expect(upkeepNeeded).to.be.true
        await consumer.performUpkeep(upkeepData)

        // Get active MCPs
        const activeMcps = await consumer.getConsumerMcps(user.address)
        expect(activeMcps.length).to.equal(0)
    })

    it('should revert when subscribing to a non-existent MCP', async () => {
        const { consumer, mockFeed, user, provider } = await loadFixture(deployMcpFixture)

        // Set mock AVAX/USD price to $20 (8 decimals)
        await mockFeed.updateAnswer(2000000000)

        // Try to subscribe to an MCP that doesn't exist (e.g., nonce 9999)
        const requiredAvax = await provider.getLicenseFeeInAvax()

        await expect(
            consumer.connect(user).subscribeToMcp(9999, { value: requiredAvax }),
        ).to.be.revertedWith('Invalid provider')
    })

    /*TODO: two users subscribe to 3 MCPs with _providerNonce 0 1 2, all MCP providers are penalized, 
    all consumers are refunded avax paid, enum status becomes 'completed', getUserMcps(addresses) forEach MUST return nothing*/

    it('should refund all AVAX and mark subs as completed when all providers are penalized', async () => {
        const { consumer, provider, mockFeed, owner, user, otherAccount } =
            await loadFixture(deployMcpFixture)

        // Set AVAX/USD price to $20
        await mockFeed.updateAnswer(2000000000)

        const iface = provider.interface

        const registerMcp = async (name: string) => {
            const licenseFee = await provider.getLicenseFeeInAvax()
            const tx = await provider
                .connect(owner)
                .registerMcp(
                    name,
                    hre.ethers.parseUnits('10', 18),
                    `${name} desc`,
                    `https://${name.toLowerCase()}.com`,
                    { value: licenseFee },
                )
            const receipt = await tx.wait()
            const event = receipt.logs
                .map((l: any) => iface.parseLog(l))
                .find((e: any) => e.name === 'McpProviderRegistered')
            return event.args.providerNonce
        }

        // 🧱 Register 3 MCPs
        const [mcp0, mcp1, mcp2] = await Promise.all([
            registerMcp('MCP0'),
            registerMcp('MCP1'),
            registerMcp('MCP2'),
        ])

        const licensePriceAvax = await provider.getLicenseFeeInAvax()

        // 💸 Track balances
        const userStart = await hre.ethers.provider.getBalance(user.address)
        const otherStart = await hre.ethers.provider.getBalance(otherAccount.address)

        // 👥 Both users subscribe to all 3 MCPs
        const allMcpNonces = [mcp0, mcp1, mcp2]
        for (const mcp of allMcpNonces) {
            await consumer.connect(user).subscribeToMcp(mcp, { value: licensePriceAvax })
            await consumer.connect(otherAccount).subscribeToMcp(mcp, { value: licensePriceAvax })
        }

        // 🧨 Penalize all 3 MCPs
        for (const mcp of allMcpNonces) {
            await consumer.connect(owner).penalizeProvider(mcp)
        }

        // 🔍 Assert: all subs are gone (filtered out)
        const userMcps = await consumer.getConsumerMcps(user.address)
        const otherMcps = await consumer.getConsumerMcps(otherAccount.address)
        expect(userMcps.length).to.equal(0)
        expect(otherMcps.length).to.equal(0)

        // 💰 Assert: balances increased (minus gas)
        const userEnd = await hre.ethers.provider.getBalance(user.address)
        const otherEnd = await hre.ethers.provider.getBalance(otherAccount.address)

        expect(userEnd).to.be.gt(userStart - hre.ethers.parseEther('0.05')) // allow for gas loss
        expect(otherEnd).to.be.gt(otherStart - hre.ethers.parseEther('0.05'))
    })

    it('should revert if upkeep is called before GRACE_PERIOD has passed', async () => {
        const { user, consumer, provider } = await loadFixture(deployMcpFixture)

        const license = await provider.licenses(0)
        const priceUsd = license.usdPriceForConsumerMonth
        const latestPrice = await consumer.getLatestAvaxUsdPrice()
        const requiredAvax = (priceUsd * BigInt(10 ** 8)) / latestPrice

        await consumer.connect(user).subscribeToMcp(0, { value: requiredAvax })

        // 🛠️ Manually encode performData (since checkUpkeep will return 0x)
        const performData = hre.ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint256'],
            [user.address, 0],
        )

        // ❌ Attempt to perform upkeep anyway (should fail due to time not yet passed)
        await expect(consumer.performUpkeep(performData)).to.be.revertedWith('Not expired yet')
    })
})
