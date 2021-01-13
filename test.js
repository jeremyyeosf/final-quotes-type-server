db.getCollection("playerdata").aggregate([
    {
        $project: {
            playerName: 1,
            playerScore: 1,
        },
    },
    {
        $sort: {
            playerScore: -1,
        },
    },
    {
        $limit: 10
    },
]);
