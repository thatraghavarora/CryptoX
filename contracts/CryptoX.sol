// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract CryptoX {

    // ── Structs ──────────────────────────────────────────────────────────────
    struct User {
        address walletAddress;  // 20 bytes
        bool exists;            // 1 byte  ← packed with walletAddress
        bytes32 phoneHash;      // 32 bytes
        bytes32 pinHash;        // 32 bytes — keccak256 of PIN (never stored plain)
        string name;
        string encryptedPrivateKey;
    }

    // ── Storage ───────────────────────────────────────────────────────────────
    mapping(bytes32 => User) private usersByPhone;

    // ── Events ────────────────────────────────────────────────────────────────
    event UserRegistered(address indexed wallet, bytes32 indexed phoneHash, string name);
    event PinSet(bytes32 indexed phoneHash);
    event PaymentSent(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 timestamp
    );

    // ── User Registration (without PIN — PIN set separately) ─────────────────
    function registerUser(
        string calldata _phone,
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
            pinHash: bytes32(0),   // empty until PIN is set
            name: _name,
            encryptedPrivateKey: _encryptedPrivateKey
        });

        emit UserRegistered(_wallet, phoneHash, _name);
    }

    // ── Set PIN (hashed) ──────────────────────────────────────────────────────
    // PIN is hashed on the server before calling this, so plain PIN never leaves backend
    function setPin(string calldata _phone, bytes32 _pinHash) external {
        bytes32 phoneHash = keccak256(abi.encodePacked(_phone));
        require(usersByPhone[phoneHash].exists, "User not found");
        usersByPhone[phoneHash].pinHash = _pinHash;
        emit PinSet(phoneHash);
    }

    // ── Verify PIN ────────────────────────────────────────────────────────────
    function verifyPin(string calldata _phone, bytes32 _pinHash) external view returns (bool) {
        bytes32 phoneHash = keccak256(abi.encodePacked(_phone));
        User storage user = usersByPhone[phoneHash];
        if (!user.exists) return false;
        if (user.pinHash == bytes32(0)) return false; // PIN not set
        return user.pinHash == _pinHash;
    }

    // ── Check if PIN is set ───────────────────────────────────────────────────
    function isPinSet(string calldata _phone) external view returns (bool) {
        bytes32 phoneHash = keccak256(abi.encodePacked(_phone));
        User storage user = usersByPhone[phoneHash];
        return user.exists && user.pinHash != bytes32(0);
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
        User storage user = usersByPhone[phoneHash];
        return (user.walletAddress, user.name, user.encryptedPrivateKey, user.exists);
    }

    // ── Record Payment Event ──────────────────────────────────────────────────
    function recordPayment(address _to, uint256 _amount) external {
        emit PaymentSent(msg.sender, _to, _amount, block.timestamp);
    }
}