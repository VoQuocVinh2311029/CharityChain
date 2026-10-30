// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CharityDonation {
    address public owner;
    uint256 public campaignCount;

    struct Campaign {
        uint256 id;
        string title;
        string description;
        string imageUrl;
        address payable creator;
        uint256 goal;
        uint256 totalRaised;
        bool withdrawn;
    }

    mapping(uint256 => Campaign) public campaigns;

    event CampaignCreated(
        uint256 indexed id,
        string title,
        address indexed creator,
        uint256 goal
    );

    event DonationReceived(
        uint256 indexed campaignId,
        address indexed donor,
        uint256 amount
    );

    event FundsWithdrawn(
        uint256 indexed campaignId,
        address indexed creator,
        uint256 amount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier campaignExists(uint256 _campaignId) {
        require(
            _campaignId > 0 && _campaignId <= campaignCount,
            "Campaign not found"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Tao chien dich quyen gop
    function createCampaign(
        string memory _title,
        string memory _description,
        string memory _imageUrl,
        uint256 _goal
    ) external {
        require(bytes(_title).length > 0, "Title required");
        require(_goal > 0, "Goal must be positive");

        campaignCount++;

        campaigns[campaignCount] = Campaign({
            id: campaignCount,
            title: _title,
            description: _description,
            imageUrl: _imageUrl,
            creator: payable(msg.sender),
            goal: _goal,
            totalRaised: 0,
            withdrawn: false
        });

        emit CampaignCreated(
            campaignCount,
            _title,
            msg.sender,
            _goal
        );
    }

    // Quyen gop ETH
    function donate(
        uint256 _campaignId
    ) external payable campaignExists(_campaignId) {
        Campaign storage campaign = campaigns[_campaignId];

        require(!campaign.withdrawn, "Campaign closed");
        require(msg.value > 0, "Donation must be positive");

        campaign.totalRaised += msg.value;

        emit DonationReceived(
            _campaignId,
            msg.sender,
            msg.value
        );
    }

    // Rut tien quyen gop
    function withdrawFunds(
        uint256 _campaignId
    ) external campaignExists(_campaignId) {
        Campaign storage campaign = campaigns[_campaignId];

        require(
            msg.sender == campaign.creator,
            "Not campaign creator"
        );
        require(!campaign.withdrawn, "Already withdrawn");
        require(campaign.totalRaised > 0, "No donations");

        uint256 amount = campaign.totalRaised;

        // Danh dau truoc khi chuyen tien
        campaign.withdrawn = true;
        campaign.totalRaised = 0;

        (bool success, ) = campaign.creator.call{value: amount}("");

        require(success, "Transfer failed");

        emit FundsWithdrawn(
            _campaignId,
            campaign.creator,
            amount
        );
    }

    // Xem thong tin chien dich
    function getCampaign(
        uint256 _campaignId
    )
        external
        view
        campaignExists(_campaignId)
        returns (
            uint256 id,
            string memory title,
            string memory description,
            string memory imageUrl,
            address creator,
            uint256 goal,
            uint256 totalRaised,
            bool withdrawn
        )
    {
        Campaign storage campaign = campaigns[_campaignId];

        return (
            campaign.id,
            campaign.title,
            campaign.description,
            campaign.imageUrl,
            campaign.creator,
            campaign.goal,
            campaign.totalRaised,
            campaign.withdrawn
        );
    }

    // Xem so du hop dong
    function getContractBalance()
        external
        view
        returns (uint256)
    {
        return address(this).balance;
    }
}