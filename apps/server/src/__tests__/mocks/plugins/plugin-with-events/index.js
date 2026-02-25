let eventCounts = {
  userJoined: 0,
  userLeft: 0,
  messageCreated: 0
};

const onLoad = (ctx) => {
  ctx.log('Plugin with events loaded');

  ctx.events.on('user:joined', ({ username }) => {
    eventCounts.userJoined++;
    ctx.log(`User joined event: ${username}`);
  });

  ctx.events.on('user:left', ({ username }) => {
    eventCounts.userLeft++;
    ctx.log(`User left event: ${username}`);
  });

  ctx.events.on('message:created', ({ content }) => {
    eventCounts.messageCreated++;
    ctx.log(`Message created event: ${content}`);
  });

  ctx.commands.register({
    name: 'get-counts',
    description: 'Get event counts',
    async executes(_ctx) {
      return eventCounts;
    }
  });

  ctx.commands.register({
    name: 'send-message',
    description: 'Send a message via plugin action',
    args: [
      { name: 'channelId', type: 'number' },
      { name: 'content', type: 'string' }
      // note: additional properties such as embed may be passed even though
      // not described here; they will be forwarded by the handler
    ],
    async executes(_ctx, args) {
      const createOpts = {
        channelId: args.channelId,
        userId: 1,
        content: args.content
      };
      if (args.embed !== undefined) {
        createOpts.embed = args.embed;
      }
      const id = await ctx.actions.messages.create(createOpts);
      return { id };
    }
  });

  ctx.commands.register({
    name: 'edit-message',
    description: 'Edit message via plugin action',
    args: [
      { name: 'messageId', type: 'number' },
      { name: 'content', type: 'string' }
    ],
    async executes(_ctx, args) {
      await ctx.actions.messages.update(args.messageId, args.content);
      return { success: true };
    }
  });

  ctx.commands.register({
    name: 'delete-message',
    description: 'Delete message via plugin action',
    args: [{ name: 'messageId', type: 'number' }],
    async executes(_ctx, args) {
      await ctx.actions.messages.delete(args.messageId);
      return { success: true };
    }
  });
};

const onUnload = (ctx) => {
  ctx.log('Plugin with events unloaded');
  eventCounts = { userJoined: 0, userLeft: 0, messageCreated: 0 };
};

export { onLoad, onUnload };
