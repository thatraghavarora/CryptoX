// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract CryptoX {

    // ── Structs ──────────────────────────────────────────────────────────────
    struct User {
        address walletAddress;  // 20 bytes
        bool exists;            // 1 byte  ← packed with walletAddress in same slot
        bytes32 phoneHash;      // 32 bytes
        string name;
        string encryptedPrivateKey;
    }

    // ── Storage ───────────────────────────────────────────────────────────────
    mapping(bytes32 => User) private usersByPhone;

    // ── Events (cheap alternative to on-chain storage for payments) ───────────
    event UserRegistered(address indexed wallet, bytes32 indexed phoneHash, string name);
    event PaymentSent(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 timestamp
    );

    // ── User Registration ─────────────────────────────────────────────────────
    function registerUser(
        string calldata _phone,         // calldata = cheaper than memory
        string calldata _name,
        address _wallet,
        string calldata _encryptedPrivateKey
    ) external {
        bytes32 phoneHash = keccak256(abi.encodePacked(_phone));
        require(!usersByPhone[phoneHash].exists, "User already exists");

        usersByPhone[phoneHash] = User({
            walletAddress: _wallet,
            exists: true,
            phoneHash: phoneHash,
            name: _name,
            encryptedPrivateKey: _encryptedPrivateKey
        });

        emit UserRegistered(_wallet, phoneHash, _name);
    }

    // ── Get User ──────────────────────────────────────────────────────────────
    function getUser(string calldata _phone)
        external
        view
        returns (
            address walletAddress,
            string memory name,
            string memory encryptedPrivateKey,
            bool exists
        )
    {
        bytes32 phoneHash = keccak256(abi.encodePacked(_phone));
        User storage user = usersByPhone[phoneHash]; // storage ref = no copy cost
        return (user.walletAddress, user.name, user.encryptedPrivateKey, user.exists);
    }

    // ── Record Payment (emit event only — no array storage = very cheap) ──────
    function recordPayment(address _to, uint256 _amount) external {
        emit PaymentSent(msg.sender, _to, _amount, block.timestamp);
    }
}