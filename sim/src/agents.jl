abstract type Agent end 
struct RandomAgent <: Agent end 
struct GreedyAgent <: Agent end

function act(agent::RandomAgent, view, kind, legal, rng)
    @assert !isempty(legal)

    action = rand(rng, legal)
    values = fill(1/length(legal), length(legal))
    return action, values
end

