module Werewolf

# Werewolf simulator. Each player is an agent with a belief over the hidden roles.
#
# Files:
#   gamelog.jl     writes game logs for the viewer (schema/game_log.schema.json)
#   gamerecord.jl  turns a played game (StepRecords) into a log (glue, no game logic)
# Your engine, models, beliefs and agents go in new files here; include them below.

include("gamelog.jl")
include("state.jl")
include("transitions.jl")
include("agents.jl")
include("gamerecord.jl")
include("game.jl")

export GameLog, add_player!, begin_step!, add_event!, set_belief!, set_beliefs!,
       add_decision!, add_elimination!, finish!, check_log, write_log, validate_with_viewer, pid

end
