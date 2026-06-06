const queues = new Map();

async function enqueue(key, task) {
    const previous = queues.get(key) || Promise.resolve();
    const current = previous
        .catch(() => {})
        .then(task);

    queues.set(key, current);

    await previous.catch(() => {});

    try {
        return await current;
    } finally {
        if (queues.get(key) === current) {
            queues.delete(key);
        }
    }
}

function size() {
    return queues.size;
}

module.exports = {
    enqueue,
    size
};
