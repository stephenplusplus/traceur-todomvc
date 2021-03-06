/*jshint esnext:true */

let ENTER_KEY = 13;
let TodoFilter = '';

// Todo Model
// ----------

// Our basic **Todo** model has `content`, `order`, and `done` attributes.
class Todo extends Backbone.Model {

	// Default attributes for the todo.
	defaults() {
		return {
			title: '',
			completed: false
		};
	}

	// Toggle the `completed` state of this todo item.
	toggle() {
		this.save({
			completed: !this.get('completed')
		});
	}
}


// Todo Collection
// ---------------

// The collection of todos is backed by *localStorage* instead of a remote
// server.
class TodoList extends Backbone.Collection {

	constructor(options) {
		// Reference to this collection's model.
		this.model = Todo;

		// Save all of the todo items under the `'todos'` namespace.
		this.localStorage = new Backbone.LocalStorage('todos-traceur-backbone');

		super(options);
	}

	// Filter down the list of all todo items that are finished.
	completed() {
		return this.filter((todo) => todo.get('completed'));
	}

	// Filter down the list to only todo items that are still not finished.
	remaining() {
		return this.without.apply(this, this.completed());
	}

	// We keep the Todos in sequential order, despite being saved by unordered
	// GUID in the database. This generates the next order number for new items.
	nextOrder() {
		if (!this.length) {
			return 1;
		}

		return this.last().get('order') + 1;
	}

	// Todos are sorted by their original insertion order.
	comparator(todo) {
		return todo.get('order');
	}
}

// Create our global collection of **Todos**.
var Todos = new TodoList();

// Todo Item View
// --------------

// The DOM element for a todo item...
class TodoView extends Backbone.View {

	constructor(options) {
		//... is a list tag.
		this.tagName = 'li';

		// The TodoView listens for changes to its model, re-rendering. Since there's
		// a one-to-one correspondence between a **Todo** and a **TodoView** in this
		// app, we set a direct reference on the model for convenience.

		this.model = Todo;

		// Cache the template function for a single item.
		this.template = _.template($('#item-template').html());

		this.input = '';

		// The DOM events specific to an item.
		this.events = {
			'click .toggle': 'toggleCompleted',
			'dblclick label': 'edit',
			'click .destroy': 'clear',
			'keypress .edit': 'updateOnEnter',
			'blur .edit': 'close'
		};

		super(options);

		this.listenTo(this.model, 'change', this.render);
		this.listenTo(this.model, 'destroy', this.remove);
		this.listenTo(this.model, 'visible', this.toggleVisible);

	}

	// Re-render the contents of the todo item.
	render() {
		this.$el.html(this.template(this.model.toJSON()));
		this.$el.toggleClass('completed', this.model.get('completed'));
		this.toggleVisible();
		this.input = this.$('.edit');
		return this;
	}

	toggleVisible() {
		this.$el.toggleClass('hidden', this.isHidden());
	}

	isHidden() {
		var isCompleted = this.model.get('completed');
		return (// hidden cases only
			(!isCompleted && TodoFilter === 'completed') ||
			(isCompleted && TodoFilter === 'active')
		);
	}

	// Toggle the `"completed"` state of the model.
	toggleCompleted() {
		this.model.toggle();
	}

	// Switch this view into `'editing'` mode, displaying the input field.
	edit() {
		var value = this.input.val();

		this.$el.addClass('editing');
		this.input.val(value).focus();
	}

	// Close the `'editing'` mode, saving changes to the todo.
	close() {
		var value = this.input.val();

		if (value) {
			this.model.save({ title: value });
		} else {
			this.clear();
		}

		this.$el.removeClass('editing');
	}

	// If you hit `enter`, we're through editing the item.
	updateOnEnter(e) {
		if (e.which === ENTER_KEY) {
			this.close();
		}
	}

	// Remove the item, destroy the model.
	clear() {
		this.model.destroy();
	}
}

// The Application
// ---------------

// Our overall **AppView** is the top-level piece of UI.
class AppView extends Backbone.View {

	constructor() {

		// Instead of generating a new element, bind to the existing skeleton of
		// the App already present in the HTML.
		this.setElement($('#todoapp'), true);

		this.statsTemplate = _.template($('#stats-template').html()),

		// Delegated events for creating new items, and clearing completed ones.
		this.events = {
			'keypress #new-todo': 'createOnEnter',
			'click #clear-completed': 'clearCompleted',
			'click #toggle-all': 'toggleAllComplete'
		};

		// At initialization we bind to the relevant events on the `Todos`
		// collection, when items are added or changed. Kick things off by
		// loading any preexisting todos that might be saved in *localStorage*.
		this.allCheckbox = this.$('#toggle-all')[0];
		this.$input = this.$('#new-todo');
		this.$footer = this.$('#footer');
		this.$main = this.$('#main');

		this.listenTo(Todos, 'add', this.addOne);
		this.listenTo(Todos, 'reset', this.addAll);
		this.listenTo(Todos, 'change:completed', this.filterOne);
		this.listenTo(Todos, 'filter', this.filterAll);
		this.listenTo(Todos, 'all', this.render);

		Todos.fetch();

		super();
	}

	// Re-rendering the App just means refreshing the statistics -- the rest
	// of the app doesn't change.
	render() {
		let completed = Todos.completed().length;
		let remaining = Todos.remaining().length;

		if (Todos.length) {
			this.$main.show();
			this.$footer.show();

			this.$footer.html(this.statsTemplate({
				completed: completed,
				remaining: remaining
			}));

			this.$('#filters li a')
				.removeClass('selected')
				.filter('[href="#/' + (TodoFilter || '') + '"]')
				.addClass('selected');
		} else {
			this.$main.hide();
			this.$footer.hide();
		}

		this.allCheckbox.checked = !remaining;
	}

	// Add a single todo item to the list by creating a view for it, and
	// appending its element to the `<ul>`.
	addOne(todo) {
		let view = new TodoView({ model: todo });
		$('#todo-list').append(view.render().el);
	}

	// Add all items in the **Todos** collection at once.
	addAll() {
		this.$('#todo-list').html('');
		Todos.each(this.addOne, this);
	}

	filterOne(todo) {
		todo.trigger('visible');
	}

	filterAll() {
		Todos.each(this.filterOne, this);
	}

	// Generate the attributes for a new Todo item.
	newAttributes() {
		return {
			title: this.$input.val().trim(),
			order: Todos.nextOrder(),
			completed: false
		};
	}

	// If you hit return in the main input field, create new **Todo** model,
	// persisting it to *localStorage*.
	createOnEnter(e) {
		if (e.which !== ENTER_KEY || !this.$input.val().trim()) {
			return;
		}

		Todos.create(this.newAttributes());
		this.$input.val('');
	}

	// Clear all completed todo items, destroying their models.
	clearCompleted() {
		_.invoke(Todos.completed(), 'destroy');
		return false;
	}

	toggleAllComplete() {
		let completed = this.allCheckbox.checked;
		Todos.each((todo) => todo.save({ 'completed': completed }));
	}
}


class Workspace extends Backbone.Router {

	constructor() {
		this.routes = {
			'*filter': 'setFilter'
		}

		this._bindRoutes();
	}

	setFilter(param) {
		// Set the current filter to be used
		TodoFilter = param || '';

		// Trigger a collection filter event, causing hiding/unhiding
		// of Todo view items
		Todos.trigger('filter');
	}
}


// Load the application once the DOM is ready, using `jQuery.ready`:
$(() => {
	// Finally, we kick things off by creating the **App**.
	new AppView();
	new Workspace();
	Backbone.history.start();
});
